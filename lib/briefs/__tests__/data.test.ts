import { describe, it, expect } from "vitest";
import { computeDailyData, computeWeeklyData } from "@/lib/briefs/data";
import type { UsageRow } from "@/types";

// ── Fixtures ───────────────────────────────────────────────────────────────

// Compute relative dates once so all tests stay current as the calendar advances
function relDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
const TODAY_UTC        = relDate(0);
const YESTERDAY_UTC    = relDate(1);
const TWO_DAYS_AGO     = relDate(2);
const PRIOR_WEEK_UTC   = relDate(8); // end of prior 7-day window

function makeRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    provider: "openai",
    apiKeyId: "key_001",
    apiKeyName: "Prod Key",
    model: "gpt-4o",
    date: YESTERDAY_UTC,
    inputTokens: 1000,
    outputTokens: 200,
    requests: 10,
    costUSD: 5.0,
    costPer1KInput: 5.0,
    costPer1KOutput: 15.0,
    ...overrides,
  };
}

/** N days of rows for a given model, ending on yesterday */
function daysOfRows(
  days: number,
  costPerDay: number,
  endDate = YESTERDAY_UTC,
  overrides: Partial<UsageRow> = {}
): UsageRow[] {
  const rows: UsageRow[] = [];
  const end = new Date(endDate + "T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    rows.push(makeRow({ date: d.toISOString().slice(0, 10), costUSD: costPerDay, ...overrides }));
  }
  return rows;
}

// ── computeDailyData ───────────────────────────────────────────────────────

describe("computeDailyData", () => {
  it("returns empty data for empty rows", () => {
    const result = computeDailyData([]);
    expect(result.yesterday.totalCostUSD).toBe(0);
    expect(result.yesterday.byProvider).toHaveLength(0);
  });

  it("identifies the most recent date as yesterday", () => {
    const rows = daysOfRows(7, 5.0);
    const result = computeDailyData(rows);
    expect(result.reportDate).toBe(YESTERDAY_UTC);
  });

  it("computes yesterday total cost correctly", () => {
    const rows = [
      makeRow({ date: TWO_DAYS_AGO, costUSD: 3.0 }),
      makeRow({ date: YESTERDAY_UTC, costUSD: 7.0 }),
      makeRow({ date: YESTERDAY_UTC, costUSD: 2.0, model: "gpt-4o-mini" }),
    ];
    const result = computeDailyData(rows);
    expect(result.yesterday.totalCostUSD).toBeCloseTo(9.0);
  });

  it("computes prior day change percentage", () => {
    const rows = [
      makeRow({ date: TWO_DAYS_AGO, costUSD: 5.0 }),
      makeRow({ date: YESTERDAY_UTC, costUSD: 10.0 }),
    ];
    const result = computeDailyData(rows);
    expect(result.priorDay.changePct).toBeCloseTo(100.0);
  });

  it("handles zero prior day gracefully (changePct=0)", () => {
    const rows = [
      makeRow({ date: YESTERDAY_UTC, costUSD: 10.0 }),
    ];
    const result = computeDailyData(rows);
    expect(result.priorDay.changePct).toBe(0);
    expect(result.priorDay.totalCostUSD).toBe(0);
  });

  it("groups by provider correctly", () => {
    const rows = [
      makeRow({ date: YESTERDAY_UTC, provider: "openai", costUSD: 5.0 }),
      makeRow({ date: YESTERDAY_UTC, provider: "anthropic", costUSD: 3.0 }),
      makeRow({ date: YESTERDAY_UTC, provider: "openai", costUSD: 2.0, model: "gpt-4o-mini" }),
    ];
    const result = computeDailyData(rows);
    const oai = result.yesterday.byProvider.find((p) => p.provider === "openai");
    const ant = result.yesterday.byProvider.find((p) => p.provider === "anthropic");
    expect(oai?.costUSD).toBeCloseTo(7.0);
    expect(ant?.costUSD).toBeCloseTo(3.0);
  });

  it("sorts byProvider descending by cost", () => {
    const rows = [
      makeRow({ date: YESTERDAY_UTC, provider: "openai", costUSD: 1.0 }),
      makeRow({ date: YESTERDAY_UTC, provider: "anthropic", costUSD: 10.0 }),
    ];
    const result = computeDailyData(rows);
    expect(result.yesterday.byProvider[0].provider).toBe("anthropic");
  });

  it("computes pctOfTotal correctly", () => {
    const rows = [
      makeRow({ date: YESTERDAY_UTC, provider: "openai", costUSD: 8.0 }),
      makeRow({ date: YESTERDAY_UTC, provider: "anthropic", costUSD: 2.0 }),
    ];
    const result = computeDailyData(rows);
    const oai = result.yesterday.byProvider.find((p) => p.provider === "openai");
    expect(oai?.pctOfTotal).toBeCloseTo(80.0);
  });

  it("limits topModels to 8", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow({ date: YESTERDAY_UTC, model: `model-${i}`, costUSD: i + 1 })
    );
    const result = computeDailyData(rows);
    expect(result.yesterday.topModels).toHaveLength(8);
  });

  it("sorts topModels descending by cost", () => {
    const rows = [
      makeRow({ date: YESTERDAY_UTC, model: "cheap", costUSD: 1.0 }),
      makeRow({ date: YESTERDAY_UTC, model: "expensive", costUSD: 50.0 }),
    ];
    const result = computeDailyData(rows);
    expect(result.yesterday.topModels[0].model).toBe("expensive");
  });

  it("computes trailing 7d total and average", () => {
    // 14 days of $5/day
    const rows = daysOfRows(14, 5.0);
    const result = computeDailyData(rows);
    // trailing7d covers the last 7 dates
    expect(result.trailing7d.totalCostUSD).toBeCloseTo(35.0);
    expect(result.trailing7d.avgPerDay).toBeCloseTo(5.0);
  });

  it("includes up to 7 days in byDay array", () => {
    const rows = daysOfRows(14, 5.0);
    const result = computeDailyData(rows);
    expect(result.trailing7d.byDay.length).toBeLessThanOrEqual(7);
    expect(result.trailing7d.byDay.length).toBeGreaterThan(0);
  });

  it("skips today's partial data and reports on last complete day", () => {
    const rows = [
      makeRow({ date: YESTERDAY_UTC, costUSD: 5.0 }),
      makeRow({ date: TODAY_UTC, costUSD: 999.0 }), // today — partial, skip
    ];
    const result = computeDailyData(rows);
    // Should report on yesterday (last complete day), not today's partial data
    expect(result.reportDate).toBe(YESTERDAY_UTC);
    expect(result.yesterday.totalCostUSD).toBeCloseTo(5.0);
  });
});

// ── computeWeeklyData ──────────────────────────────────────────────────────

describe("computeWeeklyData", () => {
  it("returns empty data for insufficient rows", () => {
    const result = computeWeeklyData([makeRow()]);
    expect(result.thisWeek.totalCostUSD).toBe(0);
  });

  it("computes this week and prior week totals", () => {
    // 14 days — last 7 = $10/day, prior 7 = $5/day
    const thisWeekRows = daysOfRows(7, 10.0, YESTERDAY_UTC);
    const priorWeekRows = daysOfRows(7, 5.0, PRIOR_WEEK_UTC);
    const rows = [...priorWeekRows, ...thisWeekRows];
    const result = computeWeeklyData(rows);

    expect(result.thisWeek.totalCostUSD).toBeCloseTo(70.0);
    expect(result.priorWeek.totalCostUSD).toBeCloseTo(35.0);
    expect(result.priorWeek.changePct).toBeCloseTo(100.0); // doubled
  });

  it("identifies new models not present in prior week", () => {
    const existing = daysOfRows(14, 5.0, YESTERDAY_UTC, { model: "gpt-4o" });
    const newModel = daysOfRows(3, 2.0, YESTERDAY_UTC, { model: "gpt-5-preview" });
    const result = computeWeeklyData([...existing, ...newModel]);
    expect(result.newModels).toContain("gpt-5-preview");
    expect(result.newModels).not.toContain("gpt-4o");
  });

  it("identifies new keys not present in prior week", () => {
    const oldKey = daysOfRows(14, 5.0, YESTERDAY_UTC, { apiKeyId: "key_old", apiKeyName: "Old Key" });
    const newKey = daysOfRows(3, 2.0, YESTERDAY_UTC, { apiKeyId: "key_new", apiKeyName: "Brand New Key" });
    const result = computeWeeklyData([...oldKey, ...newKey]);
    expect(result.newKeys.some((k) => k.name === "Brand New Key")).toBe(true);
    expect(result.newKeys.some((k) => k.name === "Old Key")).toBe(false);
  });

  it("computes WoW change percentage correctly", () => {
    const thisWeek = daysOfRows(7, 20.0, YESTERDAY_UTC);
    const priorWeek = daysOfRows(7, 10.0, PRIOR_WEEK_UTC);
    const result = computeWeeklyData([...priorWeek, ...thisWeek]);
    expect(result.priorWeek.changePct).toBeCloseTo(100.0);
  });

  it("handles zero prior week gracefully", () => {
    const rows = daysOfRows(7, 10.0);
    const result = computeWeeklyData(rows);
    expect(result.priorWeek.changePct).toBe(0);
    expect(result.priorWeek.totalCostUSD).toBe(0);
  });

  it("groups byProvider correctly for the week", () => {
    const oai = daysOfRows(7, 10.0, YESTERDAY_UTC, { provider: "openai" });
    const ant = daysOfRows(7, 4.0, YESTERDAY_UTC, { provider: "anthropic" });
    const result = computeWeeklyData([...oai, ...ant]);
    const oaiEntry = result.thisWeek.byProvider.find((p) => p.provider === "openai");
    const antEntry = result.thisWeek.byProvider.find((p) => p.provider === "anthropic");
    expect(oaiEntry?.costUSD).toBeCloseTo(70.0);
    expect(antEntry?.costUSD).toBeCloseTo(28.0);
  });

  it("limits topModels to 10", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      makeRow({ date: YESTERDAY_UTC, model: `model-${i}`, costUSD: 1.0 })
    );
    const result = computeWeeklyData(rows);
    expect(result.thisWeek.topModels.length).toBeLessThanOrEqual(10);
  });

  it("generates a week label", () => {
    const rows = daysOfRows(14, 5.0, YESTERDAY_UTC);
    const result = computeWeeklyData(rows);
    expect(result.weekLabel).toBeTruthy();
    expect(result.weekLabel).toContain("2026");
  });

  it("byDay covers each date in the current week", () => {
    const rows = daysOfRows(14, 5.0, YESTERDAY_UTC);
    const result = computeWeeklyData(rows);
    expect(result.thisWeek.byDay.length).toBeGreaterThanOrEqual(6);
    expect(result.thisWeek.byDay.every((d) => d.date >= result.thisWeek.startDate)).toBe(true);
  });
});
