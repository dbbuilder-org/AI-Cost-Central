"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface CallsiteRow {
  callsite: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
  topModel: string;
  recommendation: string | null;
}

interface AttributionSummary {
  totalCostUsd: number;
  totalRequests: number;
  callsiteCount: number;
  withRecommendations: number;
  days: number;
}

interface AttributionData {
  callsites: CallsiteRow[];
  summary: AttributionSummary;
}

function fmtCost(n: number): string {
  if (n < 0.001) return `$${(n * 1000).toFixed(3)}m`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

// Abbreviate a callsite like "src/agents/coder.ts:42" → "coder.ts:42"
function abbrevCallsite(cs: string): string {
  const parts = cs.split("/");
  return parts[parts.length - 1] ?? cs;
}

const MODEL_BADGE_COLOR: Record<string, string> = {
  "gpt-4o":             "bg-green-100 text-green-800",
  "gpt-4o-mini":        "bg-green-50 text-green-700",
  "gpt-4.1":            "bg-emerald-100 text-emerald-800",
  "gpt-4.1-mini":       "bg-emerald-50 text-emerald-700",
  "gpt-4.1-nano":       "bg-emerald-50 text-emerald-600",
  "claude-sonnet-4-5":  "bg-purple-100 text-purple-800",
  "claude-haiku-4-5":   "bg-purple-50 text-purple-700",
  "claude-opus-4-5":    "bg-purple-200 text-purple-900",
  "o3":                 "bg-amber-100 text-amber-800",
  "o4-mini":            "bg-amber-50 text-amber-700",
};

function ModelBadge({ model }: { model: string }) {
  const cls = MODEL_BADGE_COLOR[model] ?? "bg-slate-100 text-slate-700";
  const label = model.length > 18 ? model.slice(0, 17) + "…" : model;
  return <span className={`inline-block text-xs font-mono px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

export function CodeAttributionCard() {
  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/github/attribution?days=${days}&limit=25`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d as AttributionData);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Code Attribution</CardTitle>
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
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && data && data.callsites.length === 0 && (
          <div className="py-8 text-center text-slate-500 text-sm">
            <p className="font-medium mb-1">No callsite data yet</p>
            <p className="text-xs">
              Add <code className="bg-slate-100 px-1 rounded">X-Source-File: path/to/file.ts:line</code> headers
              to your SmartRouter requests to enable code attribution.
            </p>
          </div>
        )}

        {!loading && !error && data && data.callsites.length > 0 && (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">
                  {data.summary.totalCostUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500">total spend ({days}d)</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">{data.summary.callsiteCount}</p>
                <p className="text-xs text-slate-500">callsites tracked</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-amber-600">{data.summary.withRecommendations}</p>
                <p className="text-xs text-slate-500">can be optimized</p>
              </div>
            </div>

            {/* Callsite table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left pb-2 font-medium">File</th>
                    <th className="text-right pb-2 font-medium">Requests</th>
                    <th className="text-right pb-2 font-medium">Tokens</th>
                    <th className="text-right pb-2 font-medium">Cost</th>
                    <th className="text-left pb-2 font-medium pl-3">Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.callsites.map((row) => (
                    <tr key={row.callsite} className="group hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <div className="font-mono text-xs text-slate-800 truncate max-w-[200px]" title={row.callsite ?? ""}>
                          {abbrevCallsite(row.callsite ?? "")}
                        </div>
                        {row.recommendation && (
                          <div className="text-xs text-amber-700 mt-0.5 leading-tight">
                            💡 {row.recommendation}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {row.requestCount.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-slate-700 tabular-nums">
                        {fmtTokens(row.totalInputTokens + row.totalOutputTokens)}
                      </td>
                      <td className="py-2 text-right font-medium text-slate-900 tabular-nums">
                        {fmtCost(row.totalCostUsd)}
                      </td>
                      <td className="py-2 pl-3">
                        <ModelBadge model={row.topModel} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
