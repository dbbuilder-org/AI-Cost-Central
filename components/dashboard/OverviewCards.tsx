"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SpendSummary } from "@/types";

interface Props {
  summary: SpendSummary;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function weekDelta(summary: SpendSummary): number | null {
  const weeks = summary.weeklyTrend;
  if (weeks.length < 2) return null;
  const prev = weeks[weeks.length - 2].costUSD;
  const curr = weeks[weeks.length - 1].costUSD;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function OverviewCards({ summary }: Props) {
  const delta = weekDelta(summary);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Spend (28d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{fmt(summary.totalCostUSD)}</div>
          {delta !== null && (
            <Badge className={`mt-1 text-xs ${delta > 0 ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300"}`}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% WoW
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wide">Top Model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-white truncate">{summary.byModel[0]?.model ?? "—"}</div>
          <div className="text-sm text-gray-400 mt-1">{fmt(summary.byModel[0]?.costUSD ?? 0)}</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wide">Top API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-white truncate">{summary.byApiKey[0]?.apiKeyName ?? "—"}</div>
          <div className="text-sm text-gray-400 mt-1">{fmt(summary.byApiKey[0]?.costUSD ?? 0)}</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{fmtNum(summary.totalRequests)}</div>
          <div className="text-sm text-gray-400 mt-1">
            {fmtNum(summary.totalInputTokens + summary.totalOutputTokens)} tokens
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
