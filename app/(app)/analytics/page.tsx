"use client";

import { useState, useEffect } from "react";
import { PlanGate } from "@/components/ui/PlanGate";
import { formatDistanceToNow } from "@/lib/utils";
import type { ForecastResult } from "@/lib/forecast";

interface AnalyticsData {
  days: number;
  historyDays: number;
  forecastEnabled: boolean;
  byDay: { date: string; costUSD: number; requests: number }[];
  totalCostUSD: number;
  forecast: ForecastResult | null;
}

const DATE_RANGES = [
  { label: "28d", days: 28 },
  { label: "90d", days: 90 },
  { label: "365d", days: 365 },
];

export default function AnalyticsPage() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/org/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d: AnalyticsData) => setData(d))
      .finally(() => setLoading(false));
  }, [days]);

  const maxCost = data ? Math.max(...data.byDay.map((d) => d.costUSD), 0.01) : 1;

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Advanced Analytics</h1>
          <p className="text-sm text-gray-500">Long-range trend analysis and spend forecasting</p>
        </div>
        <div className="flex bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          {DATE_RANGES.map(({ label, days: d }) => (
            <button
              key={label}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                days === d ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-48 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />
      )}

      {!loading && data && (
        <>
          {/* Total spend */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <p className="text-xs text-gray-500">{data.days}-day total</p>
              <p className="text-2xl font-bold text-white mt-1">${data.totalCostUSD.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <p className="text-xs text-gray-500">Avg per day</p>
              <p className="text-2xl font-bold text-white mt-1">
                ${(data.totalCostUSD / Math.max(data.byDay.length, 1)).toFixed(2)}
              </p>
            </div>
            {data.forecast && (
              <>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-xs text-gray-500">Projected this month</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    ${data.forecast.projectedMonthTotal.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {data.forecast.confidence} confidence
                  </p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <p className="text-xs text-gray-500">Daily trend</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {data.forecast.slope > 0 ? "+" : ""}${data.forecast.slope.toFixed(2)}/day
                  </p>
                  <p className={`text-xs mt-0.5 ${data.forecast.slope > 0 ? "text-red-400" : "text-green-400"}`}>
                    {data.forecast.slope > 0.01 ? "Growing" : data.forecast.slope < -0.01 ? "Declining" : "Stable"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Chart area — plan gated for 90d+ */}
          {days > 28 && !data.forecastEnabled ? (
            <PlanGate allowed={false} featureName={`${days}-day history`} requiredPlan="growth">
              <div className="h-64 bg-gray-900 border border-gray-800 rounded-2xl" />
            </PlanGate>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-gray-400 mb-4">
                Daily Spend — last {data.days} days
              </h2>
              <div className="flex items-end gap-0.5 h-40">
                {data.byDay.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 min-w-0 bg-indigo-600 rounded-t-sm hover:bg-indigo-500 transition-colors group relative"
                    style={{ height: `${Math.max((d.costUSD / maxCost) * 100, 1)}%` }}
                    title={`${d.date}: $${d.costUSD.toFixed(4)}`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                      {d.date}: ${d.costUSD.toFixed(4)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>{data.byDay[0]?.date ?? ""}</span>
                <span>{data.byDay[data.byDay.length - 1]?.date ?? ""}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
