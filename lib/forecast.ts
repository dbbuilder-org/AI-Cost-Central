/**
 * Linear regression forecasting for daily AI spend.
 *
 * Uses Ordinary Least Squares (OLS) over the last N days of daily cost data
 * to project forward. Pure TypeScript — no external ML library required.
 *
 * Returns:
 *   - slope: daily change in cost (positive = growing)
 *   - intercept: baseline cost at day 0
 *   - projectedDailyCost: estimated cost for the next day (trend extrapolated)
 *   - projectedMonthTotal: sum of projected daily costs for remaining days in the month
 *   - r2: R² coefficient (0–1, how well data fits a line; <0.3 = noisy, use with caution)
 */

export interface DailyPoint {
  date: string;   // YYYY-MM-DD
  costUSD: number;
}

export interface ForecastResult {
  slope: number;               // $/day change
  intercept: number;           // baseline
  r2: number;                  // goodness of fit (0-1)
  projectedDailyCost: number;  // next day's predicted cost
  projectedMonthTotal: number; // sum for remaining calendar days in month
  mtdUsd: number;              // spend in current calendar month so far
  daysUsed: number;            // number of data points used
  daysRemaining: number;       // calendar days left in this month (excl. today)
  confidence: "high" | "medium" | "low";
  /** Per-day projected spend for the remainder of the current month */
  forecastDays: Array<{ date: string; projectedUsd: number }>;
}

export function computeForecast(
  points: DailyPoint[],
  referenceDate?: string  // defaults to today UTC; used to calculate days remaining in month
): ForecastResult {
  const EMPTY: ForecastResult = {
    slope: 0, intercept: 0, r2: 0,
    projectedDailyCost: 0, projectedMonthTotal: 0,
    mtdUsd: 0, daysUsed: 0, daysRemaining: 0,
    confidence: "low", forecastDays: [],
  };

  if (points.length < 3) return EMPTY;

  // Use up to the last 30 days, sorted ascending
  const sorted = [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const n = sorted.length;
  const xs = sorted.map((_, i) => i);        // day index 0..n-1
  const ys = sorted.map((p) => p.costUSD);

  // OLS: slope = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)
  const sumX = xs.reduce((a, x) => a + x, 0);
  const sumY = ys.reduce((a, y) => a + y, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return EMPTY;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  // Project next day (index = n)
  const projectedDailyCost = Math.max(0, slope * n + intercept);

  // Days remaining in current month (excluding today)
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today + "T00:00:00Z");
  const year = todayDate.getUTCFullYear();
  const month = todayDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const currentDay = todayDate.getUTCDate();
  const daysRemaining = lastDay - currentDay; // days after today

  // MTD: sum of actual costs in current calendar month
  const monthPrefix = today.slice(0, 7); // "YYYY-MM"
  const mtdUsd = sorted
    .filter((p) => p.date.startsWith(monthPrefix))
    .reduce((s, p) => s + p.costUSD, 0);

  // Per-day forecast for remainder of month
  const forecastDays: ForecastResult["forecastDays"] = [];
  let projectedMonthTotal = mtdUsd;
  for (let d = 1; d <= daysRemaining; d++) {
    const futureDate = new Date(Date.UTC(year, month, currentDay + d));
    const dateStr = futureDate.toISOString().slice(0, 10);
    const projectedUsd = Math.max(0, slope * (n - 1 + d) + intercept);
    forecastDays.push({ date: dateStr, projectedUsd });
    projectedMonthTotal += projectedUsd;
  }

  const confidence: ForecastResult["confidence"] =
    r2 >= 0.7 ? "high" : r2 >= 0.3 ? "medium" : "low";

  return {
    slope,
    intercept,
    r2,
    projectedDailyCost,
    projectedMonthTotal,
    mtdUsd,
    daysUsed: n,
    daysRemaining,
    confidence,
    forecastDays,
  };
}

/** Format a forecast result as a human-readable summary. */
export function formatForecast(result: ForecastResult): string {
  if (result.daysUsed < 3) return "Not enough data to forecast";
  const trend = result.slope > 0.01 ? "↑ Growing" : result.slope < -0.01 ? "↓ Declining" : "→ Stable";
  return `${trend} · Projected month: $${result.projectedMonthTotal.toFixed(2)} · Confidence: ${result.confidence}`;
}
