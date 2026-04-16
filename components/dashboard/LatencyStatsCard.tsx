"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface LatencyStat {
  provider: string;
  modelId: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  sampleCount: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OAI",
  anthropic: "ANT",
  google: "GGL",
  groq: "GROQ",
  mistral: "MST",
};

function latencyColor(p95Ms: number): string {
  if (p95Ms < 1000) return "text-green-600";
  if (p95Ms < 3000) return "text-amber-600";
  return "text-red-600";
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = value < 1000 ? "bg-green-500" : value < 3000 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LatencyStatsCard() {
  const [stats, setStats] = useState<LatencyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/smartrouter/latency-stats?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStats(d.stats ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [days]);

  const maxP95 = Math.max(...stats.map((s) => s.p95Ms), 1);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Provider Latency</CardTitle>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map((d) => (
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
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && stats.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">
            No latency data yet. Latency is tracked automatically as requests flow through SmartRouter.
          </p>
        )}

        {!loading && !error && stats.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-5 text-xs text-slate-400 uppercase tracking-wide mb-1">
              <span className="col-span-2">Model</span>
              <span className="text-right">p50</span>
              <span className="text-right">p95</span>
              <span className="text-right">Samples</span>
            </div>
            {stats.map((s) => (
              <div key={`${s.provider}/${s.modelId}`}>
                <div className="grid grid-cols-5 items-center text-sm">
                  <div className="col-span-2">
                    <span className="font-mono text-xs bg-slate-100 px-1 rounded mr-1">
                      {PROVIDER_LABELS[s.provider] ?? s.provider}
                    </span>
                    <span className="text-slate-700 text-xs truncate">{s.modelId}</span>
                  </div>
                  <span className="text-right text-slate-600 tabular-nums text-xs">{s.p50Ms}ms</span>
                  <span className={`text-right tabular-nums text-xs font-medium ${latencyColor(s.p95Ms)}`}>
                    {s.p95Ms}ms
                  </span>
                  <span className="text-right text-slate-500 tabular-nums text-xs">{s.sampleCount.toLocaleString()}</span>
                </div>
                <Bar value={s.p95Ms} max={maxP95} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
