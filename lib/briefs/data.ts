/**
 * Computes structured data snapshots from raw UsageRow[]
 * for daily and weekly brief generation.
 */

import type { UsageRow } from "@/types";

export interface ProviderSpend {
  provider: string;
  costUSD: number;
  requests: number;
  pctOfTotal: number;
}

export interface ModelSpend {
  model: string;
  provider: string;
  costUSD: number;
  requests: number;
  costPerRequest: number;
}

export interface KeySpend {
  apiKeyId: string;
  apiKeyName: string;
  provider: string;
  costUSD: number;
  requests: number;
}

export interface DaySpend {
  date: string;
  costUSD: number;
}

// ── Daily Brief Data ───────────────────────────────────────────────────────

export interface DailyBriefData {
  reportDate: string;          // yesterday YYYY-MM-DD
  yesterday: {
    totalCostUSD: number;
    totalRequests: number;
    byProvider: ProviderSpend[];
    topModels: ModelSpend[];
    topKeys: KeySpend[];
  };
  trailing7d: {
    totalCostUSD: number;
    avgPerDay: number;
    byDay: DaySpend[];
  };
  priorDay: {
    totalCostUSD: number;
    changePct: number;
  };
}

export function computeDailyData(rows: UsageRow[]): DailyBriefData {
  const allDates = [...new Set(rows.map((r) => r.date))].sort();
  if (allDates.length === 0) {
    return emptyDailyData();
  }

  // "Yesterday" = the last *complete* day.
  // If the most recent date in the dataset is today (UTC), it has partial data
  // (the day isn't over yet), so step back to the prior date.
  const todayUTC = new Date().toISOString().slice(0, 10);
  const mostRecent = allDates[allDates.length - 1];
  const yesterday = mostRecent === todayUTC && allDates.length > 1
    ? allDates[allDates.length - 2]
    : mostRecent;
  const dayBefore = allDates.length > 2 && mostRecent === todayUTC
    ? allDates[allDates.length - 3]
    : allDates.length > 1
    ? allDates[allDates.length - 2]
    : null;
  const trailing7Start = allDates[Math.max(0, allDates.length - 7)];

  const yesterdayRows = rows.filter((r) => r.date === yesterday);
  const dayBeforeRows = dayBefore ? rows.filter((r) => r.date === dayBefore) : [];
  const trailing7Rows = rows.filter((r) => r.date >= trailing7Start);

  // Yesterday totals
  const totalCostUSD = sum(yesterdayRows, "costUSD");
  const totalRequests = sum(yesterdayRows, "requests");

  // By provider
  const providerMap = new Map<string, { cost: number; reqs: number }>();
  for (const r of yesterdayRows) {
    const e = providerMap.get(r.provider) ?? { cost: 0, reqs: 0 };
    e.cost += r.costUSD;
    e.reqs += r.requests;
    providerMap.set(r.provider, e);
  }
  const byProvider: ProviderSpend[] = [...providerMap.entries()]
    .map(([provider, { cost, reqs }]) => ({
      provider,
      costUSD: cost,
      requests: reqs,
      pctOfTotal: totalCostUSD > 0 ? (cost / totalCostUSD) * 100 : 0,
    }))
    .sort((a, b) => b.costUSD - a.costUSD);

  // Top models
  const modelMap = new Map<string, { cost: number; reqs: number; provider: string }>();
  for (const r of yesterdayRows) {
    const key = `${r.provider}::${r.model}`;
    const e = modelMap.get(key) ?? { cost: 0, reqs: 0, provider: r.provider };
    e.cost += r.costUSD;
    e.reqs += r.requests;
    modelMap.set(key, e);
  }
  const topModels: ModelSpend[] = [...modelMap.entries()]
    .map(([key, { cost, reqs, provider }]) => ({
      model: key.split("::")[1],
      provider,
      costUSD: cost,
      requests: reqs,
      costPerRequest: reqs > 0 ? cost / reqs : 0,
    }))
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 8);

  // Top keys
  const keyMap = new Map<string, { cost: number; reqs: number; name: string; provider: string }>();
  for (const r of yesterdayRows) {
    const e = keyMap.get(r.apiKeyId) ?? { cost: 0, reqs: 0, name: r.apiKeyName, provider: r.provider };
    e.cost += r.costUSD;
    e.reqs += r.requests;
    keyMap.set(r.apiKeyId, e);
  }
  const topKeys: KeySpend[] = [...keyMap.entries()]
    .map(([id, { cost, reqs, name, provider }]) => ({
      apiKeyId: id,
      apiKeyName: name,
      provider,
      costUSD: cost,
      requests: reqs,
    }))
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 5);

  // Trailing 7 days by day
  const dayMap = new Map<string, number>();
  for (const r of trailing7Rows) {
    dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + r.costUSD);
  }
  const trailing7Total = [...dayMap.values()].reduce((s, v) => s + v, 0);
  const byDay: DaySpend[] = allDates
    .slice(-7)
    .map((date) => ({ date, costUSD: dayMap.get(date) ?? 0 }));

  // Prior day comparison
  const priorDayCost = sum(dayBeforeRows, "costUSD");
  const changePct =
    priorDayCost > 0 ? ((totalCostUSD - priorDayCost) / priorDayCost) * 100 : 0;

  return {
    reportDate: yesterday,
    yesterday: { totalCostUSD, totalRequests, byProvider, topModels, topKeys },
    trailing7d: {
      totalCostUSD: trailing7Total,
      avgPerDay: trailing7Total / Math.max(byDay.length, 1),
      byDay,
    },
    priorDay: { totalCostUSD: priorDayCost, changePct },
  };
}

function emptyDailyData(): DailyBriefData {
  return {
    reportDate: new Date().toISOString().slice(0, 10),
    yesterday: { totalCostUSD: 0, totalRequests: 0, byProvider: [], topModels: [], topKeys: [] },
    trailing7d: { totalCostUSD: 0, avgPerDay: 0, byDay: [] },
    priorDay: { totalCostUSD: 0, changePct: 0 },
  };
}

// ── Weekly Brief Data ──────────────────────────────────────────────────────

export interface WeeklyBriefData {
  weekLabel: string;           // e.g. "Apr 7–13, 2026"
  thisWeek: {
    startDate: string;
    endDate: string;
    totalCostUSD: number;
    totalRequests: number;
    byProvider: ProviderSpend[];
    topModels: ModelSpend[];
    topKeys: KeySpend[];
    byDay: DaySpend[];
  };
  priorWeek: {
    totalCostUSD: number;
    changePct: number;
  };
  newModels: string[];         // models not seen in week before this one
  newKeys: { name: string; provider: string; costUSD: number }[];
}

export function computeWeeklyData(rows: UsageRow[]): WeeklyBriefData {
  const allDates = [...new Set(rows.map((r) => r.date))].sort();
  if (allDates.length < 2) return emptyWeeklyData();

  const endDate = allDates[allDates.length - 1];
  const end = new Date(endDate + "T00:00:00Z");

  // This week = last 7 days of data
  const weekStart = new Date(end);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const startDate = weekStart.toISOString().slice(0, 10);

  // Prior week = 7 days before that
  const priorEnd = new Date(weekStart);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - 6);

  const thisWeekRows = rows.filter((r) => r.date >= startDate && r.date <= endDate);
  const priorWeekRows = rows.filter(
    (r) =>
      r.date >= priorStart.toISOString().slice(0, 10) &&
      r.date <= priorEnd.toISOString().slice(0, 10)
  );

  const totalCostUSD = sum(thisWeekRows, "costUSD");
  const totalRequests = sum(thisWeekRows, "requests");
  const priorCost = sum(priorWeekRows, "costUSD");
  const changePct = priorCost > 0 ? ((totalCostUSD - priorCost) / priorCost) * 100 : 0;

  // By provider
  const providerMap = new Map<string, { cost: number; reqs: number }>();
  for (const r of thisWeekRows) {
    const e = providerMap.get(r.provider) ?? { cost: 0, reqs: 0 };
    e.cost += r.costUSD;
    e.reqs += r.requests;
    providerMap.set(r.provider, e);
  }
  const byProvider: ProviderSpend[] = [...providerMap.entries()]
    .map(([provider, { cost, reqs }]) => ({
      provider,
      costUSD: cost,
      requests: reqs,
      pctOfTotal: totalCostUSD > 0 ? (cost / totalCostUSD) * 100 : 0,
    }))
    .sort((a, b) => b.costUSD - a.costUSD);

  // Top models
  const modelMap = new Map<string, { cost: number; reqs: number; provider: string }>();
  for (const r of thisWeekRows) {
    const key = `${r.provider}::${r.model}`;
    const e = modelMap.get(key) ?? { cost: 0, reqs: 0, provider: r.provider };
    e.cost += r.costUSD;
    e.reqs += r.requests;
    modelMap.set(key, e);
  }
  const topModels: ModelSpend[] = [...modelMap.entries()]
    .map(([key, { cost, reqs, provider }]) => ({
      model: key.split("::")[1],
      provider,
      costUSD: cost,
      requests: reqs,
      costPerRequest: reqs > 0 ? cost / reqs : 0,
    }))
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 10);

  // Top keys
  const keyMap = new Map<string, { cost: number; reqs: number; name: string; provider: string }>();
  for (const r of thisWeekRows) {
    const e = keyMap.get(r.apiKeyId) ?? { cost: 0, reqs: 0, name: r.apiKeyName, provider: r.provider };
    e.cost += r.costUSD;
    e.reqs += r.requests;
    keyMap.set(r.apiKeyId, e);
  }
  const topKeys: KeySpend[] = [...keyMap.entries()]
    .map(([id, { cost, reqs, name, provider }]) => ({
      apiKeyId: id,
      apiKeyName: name,
      provider,
      costUSD: cost,
      requests: reqs,
    }))
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 5);

  // By day
  const dayMap = new Map<string, number>();
  for (const r of thisWeekRows) {
    dayMap.set(r.date, (dayMap.get(r.date) ?? 0) + r.costUSD);
  }
  const byDay: DaySpend[] = allDates
    .filter((d) => d >= startDate && d <= endDate)
    .map((date) => ({ date, costUSD: dayMap.get(date) ?? 0 }));

  // New models (in this week but not prior week)
  const priorModels = new Set(priorWeekRows.map((r) => `${r.provider}::${r.model}`));
  const thisModels = new Set(thisWeekRows.map((r) => `${r.provider}::${r.model}`));
  const newModels = [...thisModels]
    .filter((k) => !priorModels.has(k))
    .map((k) => k.split("::")[1]);

  // New keys (first seen this week)
  const priorKeyIds = new Set(priorWeekRows.map((r) => r.apiKeyId));
  const newKeyMap = new Map<string, { name: string; provider: string; cost: number }>();
  for (const r of thisWeekRows) {
    if (!priorKeyIds.has(r.apiKeyId)) {
      const e = newKeyMap.get(r.apiKeyId) ?? { name: r.apiKeyName, provider: r.provider, cost: 0 };
      e.cost += r.costUSD;
      newKeyMap.set(r.apiKeyId, e);
    }
  }
  const newKeys = [...newKeyMap.values()].map(({ name, provider, cost }) => ({
    name, provider, costUSD: cost,
  }));

  // Week label
  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const weekLabel = `${fmtDate(startDate)}–${fmtDate(endDate)}, ${endDate.slice(0, 4)}`;

  return {
    weekLabel,
    thisWeek: { startDate, endDate, totalCostUSD, totalRequests, byProvider, topModels, topKeys, byDay },
    priorWeek: { totalCostUSD: priorCost, changePct },
    newModels,
    newKeys,
  };
}

function emptyWeeklyData(): WeeklyBriefData {
  return {
    weekLabel: "",
    thisWeek: {
      startDate: "",
      endDate: "",
      totalCostUSD: 0,
      totalRequests: 0,
      byProvider: [],
      topModels: [],
      topKeys: [],
      byDay: [],
    },
    priorWeek: { totalCostUSD: 0, changePct: 0 },
    newModels: [],
    newKeys: [],
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function sum(rows: UsageRow[], field: "costUSD" | "requests"): number {
  return rows.reduce((s, r) => s + r[field], 0);
}
