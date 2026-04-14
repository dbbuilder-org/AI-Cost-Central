/**
 * Stateless anomaly detector for AI provider usage data.
 * Pure functions — no side effects, fully unit-testable.
 *
 * Algorithm:
 *  - Groups UsageRow[] by (provider, model) and (provider, apiKeyId)
 *  - Builds a daily time series of cost/requests for each group
 *  - "Today" = most recent date in dataset
 *  - "Baseline" = all dates except the most recent N (configurable)
 *  - Fires alerts when the current value deviates significantly from baseline
 */

import type { UsageRow } from "@/types";
import type { AlertConfig, AlertSeverity, AlertType, DetectionResult } from "@/types/alerts";
import { DEFAULT_CONFIG } from "@/types/alerts";

// ── Statistical utilities ──────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value: number, baseline: number, sd: number): number {
  if (sd === 0) return 0;
  return (value - baseline) / sd;
}

function determineSeverity(
  type: AlertType,
  value: number,
  baseline: number,
  z: number
): AlertSeverity {
  if (type === "new_model" || type === "new_key") return "info";
  if (type === "cost_drop") return value === 0 ? "critical" : "warning";
  // cost_spike / volume_spike
  if (z > 4 || value > baseline * 5) return "critical";
  if (z > 3 || value > baseline * 3) return "warning";
  return "info";
}

// ── Data helpers ───────────────────────────────────────────────────────────

/** Returns sorted unique dates from rows, most-recent last */
function sortedDates(rows: UsageRow[]): string[] {
  return [...new Set(rows.map((r) => r.date))].sort();
}

/** Aggregate daily cost for a given set of rows */
function dailyCostSeries(
  rows: UsageRow[],
  dates: string[]
): Record<string, number> {
  const series: Record<string, number> = {};
  for (const date of dates) {
    series[date] = 0;
  }
  for (const r of rows) {
    if (series[r.date] !== undefined) {
      series[r.date] += r.costUSD;
    }
  }
  return series;
}

/** Aggregate daily request count for a given set of rows */
function dailyRequestSeries(
  rows: UsageRow[],
  dates: string[]
): Record<string, number> {
  const series: Record<string, number> = {};
  for (const date of dates) {
    series[date] = 0;
  }
  for (const r of rows) {
    if (series[r.date] !== undefined) {
      series[r.date] += r.requests;
    }
  }
  return series;
}

// ── Cost spike / drop detector ─────────────────────────────────────────────

export function detectCostAnomalies(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);

  if (allDates.length < config.minBaselineDays + 1) return results;

  const todayDate = allDates[allDates.length - 1];
  const baselineDates = allDates.slice(0, -1); // all except most recent

  // Group by provider + model
  const modelKeys = [
    ...new Set(rows.map((r) => `${r.provider}::${r.model}`)),
  ];

  for (const key of modelKeys) {
    const [provider, model] = key.split("::");
    const modelRows = rows.filter(
      (r) => r.provider === provider && r.model === model
    );

    const costSeries = dailyCostSeries(modelRows, allDates);
    const todayValue = costSeries[todayDate] ?? 0;
    const baselineValues = baselineDates.map((d) => costSeries[d] ?? 0);
    const baseMean = mean(baselineValues);
    const baseSd = stddev(baselineValues, baseMean);

    if (baseMean < config.minBaselineCost && todayValue < config.minBaselineCost) {
      continue; // below noise threshold
    }

    const z = zScore(todayValue, baseMean, baseSd);
    const changePct =
      baseMean > 0 ? ((todayValue - baseMean) / baseMean) * 100 : 0;
    // When baseline is perfectly flat (stddev=0), fall back to absolute ratio
    const absoluteRatio = baseMean > 0 ? todayValue / baseMean : 0;
    const spikeDetected =
      (baseSd > 0 && z > config.spikeZScore) ||
      (baseSd === 0 && absoluteRatio > 1 + config.spikeMinPct / 100);

    // Cost spike
    if (
      spikeDetected &&
      changePct > config.spikeMinPct &&
      todayValue > config.minBaselineCost
    ) {
      const severity = determineSeverity("cost_spike", todayValue, baseMean, z);
      results.push({
        type: "cost_spike",
        severity,
        provider,
        subject: model,
        message: `${model} cost spiked to $${todayValue.toFixed(2)} (${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}% vs $${baseMean.toFixed(2)} baseline, z=${z.toFixed(1)})`,
        value: todayValue,
        baseline: baseMean,
        changePct,
      });
    }

    // Cost drop — only if model had meaningful baseline activity
    if (
      baseMean >= config.minBaselineCost &&
      todayValue < (baseMean * config.dropMaxPctOfBaseline) / 100
    ) {
      results.push({
        type: "cost_drop",
        severity: determineSeverity("cost_drop", todayValue, baseMean, z),
        provider,
        subject: model,
        message: `${model} cost dropped to $${todayValue.toFixed(2)} (${Math.abs(changePct).toFixed(0)}% below $${baseMean.toFixed(2)} baseline — possible integration issue)`,
        value: todayValue,
        baseline: baseMean,
        changePct,
      });
    }
  }

  return results;
}

// ── Volume spike detector ──────────────────────────────────────────────────

export function detectVolumeSpikes(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);

  if (allDates.length < config.minBaselineDays + 1) return results;

  const todayDate = allDates[allDates.length - 1];
  const baselineDates = allDates.slice(0, -1);

  const modelKeys = [
    ...new Set(rows.map((r) => `${r.provider}::${r.model}`)),
  ];

  for (const key of modelKeys) {
    const [provider, model] = key.split("::");
    const modelRows = rows.filter(
      (r) => r.provider === provider && r.model === model
    );

    const reqSeries = dailyRequestSeries(modelRows, allDates);
    const todayReqs = reqSeries[todayDate] ?? 0;
    const baselineValues = baselineDates.map((d) => reqSeries[d] ?? 0);
    const baseMean = mean(baselineValues);
    const baseSd = stddev(baselineValues, baseMean);

    if (baseMean < 5 && todayReqs < 20) continue; // ignore tiny volume

    const z = zScore(todayReqs, baseMean, baseSd);
    const changePct =
      baseMean > 0 ? ((todayReqs - baseMean) / baseMean) * 100 : 0;
    const reqSpikeDetected =
      (baseSd > 0 && z > config.spikeZScore && todayReqs > baseMean * 3) ||
      (baseSd === 0 && todayReqs > baseMean * 3);

    if (reqSpikeDetected && todayReqs > 20) {
      const severity = determineSeverity("volume_spike", todayReqs, baseMean, z);
      results.push({
        type: "volume_spike",
        severity,
        provider,
        subject: model,
        message: `${model} requests spiked to ${todayReqs.toLocaleString()} (+${changePct.toFixed(0)}% vs baseline ${Math.round(baseMean).toLocaleString()}/day)`,
        value: todayReqs,
        baseline: baseMean,
        changePct,
      });
    }
  }

  return results;
}

// ── New model detector ─────────────────────────────────────────────────────

export function detectNewModels(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);

  if (allDates.length < 8) return results; // need enough history

  // "Recent" = last 7 days; "Prior" = before that
  const recentCutoff = allDates[Math.max(0, allDates.length - 7)];
  const recentRows = rows.filter((r) => r.date >= recentCutoff);
  const priorRows = rows.filter((r) => r.date < recentCutoff);

  const priorModels = new Set(
    priorRows.map((r) => `${r.provider}::${r.model}`)
  );
  const recentModels = new Set(
    recentRows.map((r) => `${r.provider}::${r.model}`)
  );

  for (const key of recentModels) {
    if (priorModels.has(key)) continue; // already knew about this model

    const [provider, model] = key.split("::");
    const modelRecentRows = recentRows.filter(
      (r) => r.provider === provider && r.model === model
    );
    const totalCost = modelRecentRows.reduce((s, r) => s + r.costUSD, 0);
    const totalRequests = modelRecentRows.reduce((s, r) => s + r.requests, 0);

    // Only alert if there's some activity worth noting
    if (totalCost < 0.01 && totalRequests === 0) continue;

    results.push({
      type: "new_model",
      severity: "info",
      provider,
      subject: model,
      message: `New model detected: ${model} (${provider}) — first seen in last 7 days, $${totalCost.toFixed(2)} / ${totalRequests} requests`,
      value: totalCost,
      baseline: 0,
      changePct: 100,
    });
  }

  return results;
}

// ── New API key detector ───────────────────────────────────────────────────

export function detectNewKeys(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);
  if (allDates.length === 0) return results;

  const cutoffDate = allDates[Math.max(0, allDates.length - config.newKeyLookbackDays)];

  // Find keys first seen on or after the cutoff date
  const keyFirstSeen: Record<string, string> = {};
  const keyName: Record<string, string> = {};
  const keyProvider: Record<string, string> = {};

  for (const row of rows) {
    const existing = keyFirstSeen[row.apiKeyId];
    if (!existing || row.date < existing) {
      keyFirstSeen[row.apiKeyId] = row.date;
      keyName[row.apiKeyId] = row.apiKeyName;
      keyProvider[row.apiKeyId] = row.provider;
    }
  }

  for (const [keyId, firstSeen] of Object.entries(keyFirstSeen)) {
    if (firstSeen < cutoffDate) continue; // key existed before our window

    const keyRows = rows.filter((r) => r.apiKeyId === keyId);
    const totalCost = keyRows.reduce((s, r) => s + r.costUSD, 0);
    const totalRequests = keyRows.reduce((s, r) => s + r.requests, 0);
    const name = keyName[keyId];
    const provider = keyProvider[keyId];

    results.push({
      type: "new_key",
      severity: totalCost > 10 ? "warning" : "info",
      provider,
      subject: name,
      message: `New API key: "${name}" (${provider}) — first seen ${firstSeen}, $${totalCost.toFixed(2)} spend so far`,
      value: totalCost,
      baseline: 0,
      changePct: 100,
    });
  }

  return results;
}

// ── Combined entry point ───────────────────────────────────────────────────

export function detectAll(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  return [
    ...detectCostAnomalies(rows, config),
    ...detectVolumeSpikes(rows, config),
    ...detectNewModels(rows, config),
    ...detectNewKeys(rows, config),
  ];
}
