"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ModelRow {
  modelId: string;
  requests: number;
  actualCostUsd: number;
  orEstimateUsd: number;
  savingsUsd: number | null;
  savingsPct: number | null;
  orPricingAvailable: boolean;
}

interface CompareData {
  summary: {
    totalActualUsd: number;
    totalOrEstimateUsd: number;
    totalSavingsUsd: number;
    savingsPct: number;
    totalRequests: number;
    days: number;
  };
  byModel: ModelRow[];
  note: string;
}

function fmtCost(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OpenRouterCompareCard() {
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/smartrouter/openrouter-compare?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d as CompareData);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [days]);

  const hasData = data && data.byModel.some((m) => m.orPricingAvailable);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">vs OpenRouter</CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">Estimated savings over OpenRouter pricing</p>
        </div>
        <div className="flex gap-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2 py-1 rounded border ${
                days === d
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        )}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && !hasData && (
          <p className="text-sm text-slate-500 py-6 text-center">
            No routed requests yet. Once SmartRouter handles requests, this card will show cost vs OpenRouter.
          </p>
        )}

        {!loading && !error && data && hasData && (
          <>
            {/* Summary banner */}
            <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-green-50 rounded-lg">
              <div className="text-center">
                <p className="text-xl font-bold text-green-700">
                  {fmtCost(data.summary.totalSavingsUsd)}
                </p>
                <p className="text-xs text-green-600">saved vs OR ({days}d)</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-slate-900">{fmtCost(data.summary.totalActualUsd)}</p>
                <p className="text-xs text-slate-500">actual spend</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-amber-600">{data.summary.savingsPct}%</p>
                <p className="text-xs text-slate-500">cheaper than OR</p>
              </div>
            </div>

            {/* Per-model table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left pb-2 font-medium">Model</th>
                  <th className="text-right pb-2 font-medium">Actual</th>
                  <th className="text-right pb-2 font-medium">OR Est.</th>
                  <th className="text-right pb-2 font-medium">Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byModel.filter((m) => m.orPricingAvailable).map((row) => (
                  <tr key={row.modelId} className="hover:bg-slate-50">
                    <td className="py-2 pr-2">
                      <span className="font-mono text-xs text-slate-700">{row.modelId}</span>
                      <span className="ml-2 text-xs text-slate-400">×{row.requests.toLocaleString()}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs">{fmtCost(row.actualCostUsd)}</td>
                    <td className="py-2 text-right tabular-nums text-xs text-slate-500">{fmtCost(row.orEstimateUsd)}</td>
                    <td className="py-2 text-right tabular-nums text-xs font-medium text-green-700">
                      {row.savingsUsd !== null ? fmtCost(row.savingsUsd) : "—"}
                      {row.savingsPct !== null && row.savingsPct > 0 && (
                        <span className="text-green-500 ml-1">({row.savingsPct}%)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-xs text-slate-400 mt-3 italic">{data.note}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
