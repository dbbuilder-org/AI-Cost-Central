import { describe, it, expect } from "vitest";
import { computeForecast, type DailyPoint } from "@/lib/forecast";

function makePoints(costs: number[], startDate = "2026-04-01"): DailyPoint[] {
  return costs.map((costUSD, i) => {
    const d = new Date(startDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), costUSD };
  });
}

describe("computeForecast", () => {
  it("returns empty result for < 3 points", () => {
    expect(computeForecast([]).daysUsed).toBe(0);
    expect(computeForecast(makePoints([10, 20])).daysUsed).toBe(0);
    expect(computeForecast(makePoints([10, 20])).projectedDailyCost).toBe(0);
  });

  it("perfectly linear data has R² = 1 and exact slope", () => {
    // $10, $20, $30, $40, $50 — slope should be exactly $10/day
    const points = makePoints([10, 20, 30, 40, 50]);
    const result = computeForecast(points, "2026-04-06");
    expect(result.r2).toBeCloseTo(1.0, 3);
    expect(result.slope).toBeCloseTo(10, 1);
    expect(result.projectedDailyCost).toBeCloseTo(60, 1); // next point = 60
  });

  it("flat data has slope ≈ 0 and projects constant cost", () => {
    const points = makePoints([100, 100, 100, 100, 100, 100, 100]);
    const result = computeForecast(points, "2026-04-08");
    expect(result.slope).toBeCloseTo(0, 1);
    expect(result.projectedDailyCost).toBeCloseTo(100, 5);
  });

  it("projected daily cost is never negative", () => {
    // Declining trend that would go negative
    const points = makePoints([100, 80, 60, 40, 20]);
    const result = computeForecast(points, "2026-04-06");
    expect(result.projectedDailyCost).toBeGreaterThanOrEqual(0);
  });

  it("projected month total is positive for flat data", () => {
    const points = makePoints([50, 50, 50, 50, 50, 50, 50]);
    const result = computeForecast(points, "2026-04-08");
    // April 8 → 23 days remaining (Apr 8–30 = 23 days)
    // $50/day × 23 ≈ $1150
    expect(result.projectedMonthTotal).toBeGreaterThan(0);
    expect(result.projectedMonthTotal).toBeCloseTo(50 * 23, 0);
  });

  it("noisy data has R² < 0.5", () => {
    const points = makePoints([10, 100, 5, 90, 15, 80, 20]);
    const result = computeForecast(points, "2026-04-08");
    expect(result.r2).toBeLessThan(0.5);
    expect(result.confidence).toBe("low");
  });

  it("high R² gives high confidence", () => {
    const points = makePoints([10, 12, 14, 16, 18, 20, 22]);
    const result = computeForecast(points, "2026-04-08");
    expect(result.r2).toBeGreaterThan(0.7);
    expect(result.confidence).toBe("high");
  });

  it("uses at most last 30 data points", () => {
    const points = makePoints(Array.from({ length: 45 }, (_, i) => i * 2));
    const result = computeForecast(points, "2026-04-15");
    expect(result.daysUsed).toBe(30);
  });

  it("handles all-zero data gracefully", () => {
    const points = makePoints([0, 0, 0, 0, 0]);
    const result = computeForecast(points, "2026-04-06");
    expect(result.projectedDailyCost).toBe(0);
    expect(result.projectedMonthTotal).toBe(0);
  });
});
