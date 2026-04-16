"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface SmartRouterStats {
  totalRequests: number;
  totalCostUSD: number;
  totalSavingsUSD: number;
  avgSavingsPct: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byTaskType: Record<string, { requests: number; savingsUSD: number; costUSD: number }>;
  byModelUsed: Record<string, { requests: number; savingsUSD: number; costUSD: number }>;
  dailyTrend: { date: string; requests: number; savingsUSD: number; costUSD: number }[];
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const TASK_LABELS: Record<string, string> = {
  chat: "Chat",
  coding: "Coding",
  reasoning: "Reasoning",
  extraction: "Extraction",
  classification: "Classification",
  summarization: "Summarization",
  generation: "Generation",
  embedding: "Embedding",
  vision: "Vision",
};

export function SmartRouterCard() {
  const [stats, setStats] = useState<SmartRouterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/smartrouter/stats?days=28")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStats(data as SmartRouterStats);
      })
      .catch(() => setError("Failed to load SmartRouter stats"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Skeleton className="h-56 bg-gray-800 w-full" />;
  }

  if (error || !stats || stats.totalRequests === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-gray-500 text-sm">
        <p className="text-gray-400 font-medium mb-1">SmartRouter</p>
        {stats?.totalRequests === 0
          ? "No requests proxied yet. Point your API calls at /v1/chat/completions to start routing."
          : error ?? "No data"}
      </div>
    );
  }

  // Top 5 models by request count
  const topModels = Object.entries(stats.byModelUsed)
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 5);

  // Top 3 task types by savings
  const topTasks = Object.entries(stats.byTaskType)
    .sort((a, b) => b[1].savingsUSD - a[1].savingsUSD)
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-indigo-950/50 border-indigo-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-indigo-300 font-medium uppercase tracking-wide">Requests Routed (28d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{fmtNum(stats.totalRequests)}</div>
          </CardContent>
        </Card>

        <Card className="bg-green-950/50 border-green-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-green-300 font-medium uppercase tracking-wide">Total Saved (28d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{fmt(stats.totalSavingsUSD)}</div>
            <Badge className="mt-1 text-xs bg-green-900 text-green-300">
              {stats.avgSavingsPct}% avg savings
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wide">Actual Cost (28d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{fmt(stats.totalCostUSD)}</div>
            <div className="text-xs text-gray-500 mt-1">
              vs {fmt(stats.totalCostUSD + stats.totalSavingsUSD)} without routing
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-gray-400 font-medium uppercase tracking-wide">Tokens Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{fmtNum(stats.totalInputTokens + stats.totalOutputTokens)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {fmtNum(stats.totalInputTokens)}↑ {fmtNum(stats.totalOutputTokens)}↓
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model breakdown + Task breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Routed To</h3>
          <div className="space-y-2">
            {topModels.map(([model, d]) => (
              <div key={model} className="flex items-center justify-between">
                <span className="text-sm text-gray-300 truncate max-w-[180px]">{model}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{fmtNum(d.requests)} reqs</span>
                  <span className="text-xs text-green-400">{fmt(d.savingsUSD)} saved</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Top Savings by Task Type</h3>
          <div className="space-y-2">
            {topTasks.map(([task, d]) => (
              <div key={task} className="flex items-center justify-between">
                <span className="text-sm text-gray-300">{TASK_LABELS[task] ?? task}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{fmtNum(d.requests)} reqs</span>
                  <span className="text-xs text-green-400">{fmt(d.savingsUSD)} saved</span>
                </div>
              </div>
            ))}
            {topTasks.length === 0 && (
              <p className="text-xs text-gray-600">No task data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
