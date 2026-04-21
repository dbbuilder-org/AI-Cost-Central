/**
 * Stateless anomaly detector for AI provider usage data.
 * Pure functions — no side effects, fully unit-testable.
 *
 * All detectors are API-key-centric: the unit of analysis is always an
 * API key, not a model. Model info is included in messages as context
 * (to explain *why* a key's cost changed) but the alert subject is always
 * the key that behaved unexpectedly.
 *
 * Algorithm:
 *  - Groups UsageRow[] by apiKeyId
 *  - Builds a daily time series of cost/requests for each key
 *  - "Today" = most recent date in dataset
 *  - "Baseline" = all dates except the most recent one
 *  - Fires alerts when the current value deviates from baseline
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
  if (type === "key_model_shift" || type === "new_key") return "info";
  if (type === "cost_drop") return "warning"; // never critical — drops are notable, not emergencies
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
  for (const date of dates) series[date] = 0;
  for (const r of rows) {
    if (series[r.date] !== undefined) series[r.date] += r.costUSD;
  }
  return series;
}

/** Aggregate daily request count for a given set of rows */
function dailyRequestSeries(
  rows: UsageRow[],
  dates: string[]
): Record<string, number> {
  const series: Record<string, number> = {};
  for (const date of dates) series[date] = 0;
  for (const r of rows) {
    if (series[r.date] !== undefined) series[r.date] += r.requests;
  }
  return series;
}

/** Find the model with the highest cost share among a set of rows */
function dominantModel(rows: UsageRow[]): string | undefined {
  const byModel = new Map<string, number>();
  for (const r of rows) byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.costUSD);
  return [...byModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Build a map of model → total cost for a set of rows */
function modelCostMap(rows: UsageRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.model, (m.get(r.model) ?? 0) + r.costUSD);
  return m;
}

// ── Key cost spike / drop detector ────────────────────────────────────────

export function detectCostAnomalies(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);

  if (allDates.length < config.minBaselineDays + 1) return results;

  const todayDate = allDates[allDates.length - 1];
  const baselineDates = allDates.slice(0, -1);

  // Group by apiKeyId
  const keyIds = [...new Set(rows.map((r) => r.apiKeyId))];

  for (const keyId of keyIds) {
    const keyRows = rows.filter((r) => r.apiKeyId === keyId);
    const keyName = keyRows[0].apiKeyName;
    const provider = keyRows[0].provider;

    const costSeries = dailyCostSeries(keyRows, allDates);
    const todayValue = costSeries[todayDate] ?? 0;
    const baselineValues = baselineDates.map((d) => costSeries[d] ?? 0);
    const baseMean = mean(baselineValues);
    const baseSd = stddev(baselineValues, baseMean);

    if (baseMean < config.minBaselineCost && todayValue < config.minBaselineCost) {
      continue; // below noise threshold
    }

    const z = zScore(todayValue, baseMean, baseSd);
    const changePct = baseMean > 0 ? ((todayValue - baseMean) / baseMean) * 100 : 0;
    const absoluteRatio = baseMean > 0 ? todayValue / baseMean : 0;
    const spikeDetected =
      (baseSd > 0 && z > config.spikeZScore) ||
      (baseSd === 0 && absoluteRatio > 1 + config.spikeMinPct / 100);

    // Identify which model(s) drove today's spend (for context)
    const todayRows = keyRows.filter((r) => r.date === todayDate);
    const topModel = dominantModel(todayRows);
    const modelSuffix = topModel ? ` — ${topModel}` : "";

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
        subject: keyName,
        apiKeyId: keyId,
        models: topModel ? [topModel] : [],
        message: `"${keyName}" cost spiked to $${todayValue.toFixed(2)} (${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}% vs $${baseMean.toFixed(2)} baseline)${modelSuffix}`,
        value: todayValue,
        baseline: baseMean,
        changePct,
      });
    }

    // Cost drop — only if key had meaningful baseline activity AND cost is non-zero today.
    // Zero-cost days are skipped: a key simply not being called that day isn't an anomaly.
    if (
      baseMean >= config.minBaselineCost &&
      todayValue > 0 &&
      todayValue < (baseMean * config.dropMaxPctOfBaseline) / 100
    ) {
      results.push({
        type: "cost_drop",
        severity: determineSeverity("cost_drop", todayValue, baseMean, z),
        provider,
        subject: keyName,
        apiKeyId: keyId,
        models: topModel ? [topModel] : [],
        message: `"${keyName}" spend notably down to $${todayValue.toFixed(2)} (${Math.abs(changePct).toFixed(0)}% below $${baseMean.toFixed(2)} baseline — worth checking if intentional)`,
        value: todayValue,
        baseline: baseMean,
        changePct,
      });
    }
  }

  return results;
}

// ── Key volume spike detector ──────────────────────────────────────────────

export function detectVolumeSpikes(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);

  if (allDates.length < config.minBaselineDays + 1) return results;

  const todayDate = allDates[allDates.length - 1];
  const baselineDates = allDates.slice(0, -1);

  const keyIds = [...new Set(rows.map((r) => r.apiKeyId))];

  for (const keyId of keyIds) {
    const keyRows = rows.filter((r) => r.apiKeyId === keyId);
    const keyName = keyRows[0].apiKeyName;
    const provider = keyRows[0].provider;

    const reqSeries = dailyRequestSeries(keyRows, allDates);
    const todayReqs = reqSeries[todayDate] ?? 0;
    const baselineValues = baselineDates.map((d) => reqSeries[d] ?? 0);
    const baseMean = mean(baselineValues);
    const baseSd = stddev(baselineValues, baseMean);

    if (baseMean < 5 && todayReqs < 20) continue; // ignore tiny volume

    const z = zScore(todayReqs, baseMean, baseSd);
    const changePct = baseMean > 0 ? ((todayReqs - baseMean) / baseMean) * 100 : 0;
    const reqSpikeDetected =
      (baseSd > 0 && z > config.spikeZScore && todayReqs > baseMean * 3) ||
      (baseSd === 0 && todayReqs > baseMean * 3);

    if (reqSpikeDetected && todayReqs > 20) {
      const todayRows = keyRows.filter((r) => r.date === todayDate);
      const topModel = dominantModel(todayRows);

      const severity = determineSeverity("volume_spike", todayReqs, baseMean, z);
      results.push({
        type: "volume_spike",
        severity,
        provider,
        subject: keyName,
        apiKeyId: keyId,
        models: topModel ? [topModel] : [],
        message: `"${keyName}" requests spiked to ${todayReqs.toLocaleString()} (+${changePct.toFixed(0)}% vs ${Math.round(baseMean).toLocaleString()}/day baseline)${topModel ? ` — ${topModel}` : ""}`,
        value: todayReqs,
        baseline: baseMean,
        changePct,
      });
    }
  }

  return results;
}

// ── Key model shift detector ───────────────────────────────────────────────
//
// Fires when an API key uses a model today that it hasn't used before,
// or when the key's dominant model shifts significantly.
// This answers: "why did this key's cost change?" at the model level.

export function detectKeyModelShift(
  rows: UsageRow[],
  config: AlertConfig = DEFAULT_CONFIG
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const allDates = sortedDates(rows);

  if (allDates.length < config.minBaselineDays + 1) return results;

  const todayDate = allDates[allDates.length - 1];
  const keyIds = [...new Set(rows.map((r) => r.apiKeyId))];

  for (const keyId of keyIds) {
    const keyRows = rows.filter((r) => r.apiKeyId === keyId);
    const keyName = keyRows[0].apiKeyName;
    const provider = keyRows[0].provider;

    const baselineRows = keyRows.filter((r) => r.date < todayDate);
    const todayRows = keyRows.filter((r) => r.date === todayDate);

    if (baselineRows.length === 0 || todayRows.length === 0) continue;

    const baselineModels = new Set(baselineRows.map((r) => r.model));
    const todayCosts = modelCostMap(todayRows);
    const baselineCosts = modelCostMap(baselineRows);

    // 1. New models on this key (not seen in baseline)
    for (const [model, cost] of todayCosts) {
      if (baselineModels.has(model)) continue;
      if (cost < config.modelShiftMinCost) continue;

      results.push({
        type: "key_model_shift",
        severity: cost > 1.0 ? "warning" : "info",
        provider,
        subject: keyName,
        apiKeyId: keyId,
        models: [model],
        message: `"${keyName}" used ${model} for the first time ($${cost.toFixed(4)} today — not seen in prior ${allDates.length - 1} days)`,
        value: cost,
        baseline: 0,
        changePct: 100,
      });
    }

    // 2. Dominant model shifted to a different (existing) model
    const baselineDominant = [...baselineCosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const todayDominant = [...todayCosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    if (
      baselineDominant &&
      todayDominant &&
      baselineDominant !== todayDominant &&
      baselineModels.has(todayDominant)
    ) {
      const todayDominantCost = todayCosts.get(todayDominant) ?? 0;
      // Only fire if the shift is significant (dominant today was minor in baseline)
      const baselineDaysCount = allDates.length - 1;
      const baselineDominantAvgCost = (baselineCosts.get(todayDominant) ?? 0) / baselineDaysCount;
      const ratio = baselineDominantAvgCost > 0
        ? todayDominantCost / baselineDominantAvgCost
        : 0;

      if (ratio > 3 && todayDominantCost >= config.modelShiftMinCost) {
        results.push({
          type: "key_model_shift",
          severity: "info",
          provider,
          subject: keyName,
          apiKeyId: keyId,
          models: [todayDominant, baselineDominant],
          message: `"${keyName}" shifted primary model from ${baselineDominant} to ${todayDominant} ($${todayDominantCost.toFixed(4)} today vs $${baselineDominantAvgCost.toFixed(4)}/day avg)`,
          value: todayDominantCost,
          baseline: baselineDominantAvgCost,
          changePct: ratio * 100 - 100,
        });
      }
    }
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
    if (firstSeen < cutoffDate) continue;

    const keyRows = rows.filter((r) => r.apiKeyId === keyId);
    const totalCost = keyRows.reduce((s, r) => s + r.costUSD, 0);
    const totalRequests = keyRows.reduce((s, r) => s + r.requests, 0);
    const name = keyName[keyId];
    const provider = keyProvider[keyId];
    const topModel = dominantModel(keyRows);

    results.push({
      type: "new_key",
      severity: totalCost > 10 ? "warning" : "info",
      provider,
      subject: name,
      apiKeyId: keyId,
      models: topModel ? [topModel] : [],
      message: `New API key "${name}" (${provider}) — first seen ${firstSeen}, $${totalCost.toFixed(2)} / ${totalRequests} requests${topModel ? ` via ${topModel}` : ""}`,
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
    ...detectKeyModelShift(rows, config),
    ...detectNewKeys(rows, config),
  ];
}
