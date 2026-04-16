"use client";
import { useMemo } from "react";
import { computeForecast } from "@/lib/forecast";
import type { DaySummary } from "@/types";

interface Props {
  byDay: DaySummary[];
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CONFIDENCE_COLOR = {
  high:   "text-green-400",
  medium: "text-yellow-400",
  low:    "text-gray-500",
} as const;

const CONFIDENCE_LABEL = {
  high:   "High confidence",
  medium: "Medium confidence",
  low:    "Low confidence (noisy data)",
} as const;

export function SpendForecastCard({ byDay }: Props) {
  // Map DaySummary → DailyPoint
  const points = useMemo(
    () => byDay.map((d) => ({ date: d.date, costUSD: d.costUSD })),
    [byDay],
  );

  const forecast = useMemo(() => computeForecast(points), [points]);

  if (!forecast || forecast.daysUsed < 3) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">
        Not enough daily data to generate a forecast. Need at least 3 days.
      </div>
    );
  }

  const trendPositive = forecast.slope > 0.005;
  const trendNegative = forecast.slope < -0.005;
  const trendArrow = trendPositive ? "▲" : trendNegative ? "▼" : "→";
  const trendColor = trendPositive ? "text-red-400" : trendNegative ? "text-green-400" : "text-gray-400";
  const slopeAbs = Math.abs(forecast.slope);

  // Bar chart: historical + forecast days (last 14 actual + all forecast)
  const historicalSlice = points.slice(-14);
  const maxCost = Math.max(
    ...historicalSlice.map((p) => p.costUSD),
    ...forecast.forecastDays.map((d) => d.projectedUsd),
    0.01,
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Spend Forecast</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Linear trend from {forecast.daysUsed} days · {CONFIDENCE_LABEL[forecast.confidence]}
          </p>
        </div>
        <span className={`text-xs font-medium ${CONFIDENCE_COLOR[forecast.confidence]}`}>
          R² {(forecast.r2 * 100).toFixed(0)}%
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Month to Date</div>
          <div className="text-xl font-bold text-white">{fmt(forecast.mtdUsd)}</div>
        </div>

        <div className="bg-indigo-900/30 border border-indigo-800/50 rounded-lg p-4">
          <div className="text-xs text-indigo-400 mb-1">Projected Month Total</div>
          <div className="text-xl font-bold text-white">{fmt(forecast.projectedMonthTotal)}</div>
          <div className="text-xs text-indigo-400 mt-1">
            +{fmt(forecast.projectedMonthTotal - forecast.mtdUsd)} remaining
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Daily Trend</div>
          <div className={`text-xl font-bold ${trendColor}`}>
            {trendArrow} {fmt(slopeAbs)}/day
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {trendPositive ? "Spend rising" : trendNegative ? "Spend falling" : "Spend stable"}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Next Day Estimate</div>
          <div className="text-xl font-bold text-white">{fmt(forecast.projectedDailyCost)}</div>
          <div className="text-xs text-gray-500 mt-1">{forecast.daysRemaining} days left in month</div>
        </div>
      </div>

      {/* Mini bar chart: actual + projected */}
      {(historicalSlice.length > 0 || forecast.forecastDays.length > 0) && (
        <div>
          <div className="text-xs text-gray-500 mb-3">
            Daily spend — <span className="text-gray-400">actual</span> ·{" "}
            <span className="text-indigo-400">projected</span>
          </div>
          <div className="flex items-end gap-0.5 h-24">
            {historicalSlice.map((p) => {
              const pct = (p.costUSD / maxCost) * 100;
              return (
                <div
                  key={p.date}
                  className="flex-1 bg-gray-600 rounded-t relative group"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${p.date}: ${fmt(p.costUSD)}`}
                />
              );
            })}
            {/* Separator */}
            <div className="w-px bg-indigo-700 self-stretch mx-0.5" />
            {forecast.forecastDays.map((d) => {
              const pct = (d.projectedUsd / maxCost) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 bg-indigo-800/60 border border-indigo-700/40 rounded-t"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${d.date} (projected): ${fmt(d.projectedUsd)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>{historicalSlice[0]?.date ?? ""}</span>
            <span className="text-indigo-700">← forecast →</span>
            <span>{forecast.forecastDays[forecast.forecastDays.length - 1]?.date ?? ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
