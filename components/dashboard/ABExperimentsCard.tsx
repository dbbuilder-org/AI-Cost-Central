"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ExperimentResult {
  requests: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
  successRate: number;
}

interface Experiment {
  id: string;
  name: string;
  description: string | null;
  controlModel: string;
  treatmentModel: string;
  splitPct: number;
  status: string;
  winnerVariant: string | null;
  startedAt: string;
  concludedAt: string | null;
}

interface ExperimentWithResults {
  experiment: Experiment;
  results: Record<string, ExperimentResult>;
}

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  paused:    "bg-amber-100 text-amber-800",
  concluded: "bg-slate-100 text-slate-600",
};

function fmtCost(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
}

function ExperimentRow({ exp }: { exp: ExperimentWithResults }) {
  const { experiment: e, results } = exp;
  const ctrl = results["control"];
  const trt = results["treatment"];
  const hasData = ctrl || trt;

  const costDelta = ctrl && trt
    ? ((trt.avgCostUsd - ctrl.avgCostUsd) / (ctrl.avgCostUsd || 1)) * 100
    : null;

  const latencyDelta = ctrl && trt
    ? trt.avgLatencyMs - ctrl.avgLatencyMs
    : null;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{e.name}</p>
          {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[e.status] ?? STATUS_BADGE.concluded}`}>
          {e.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-50 rounded p-2">
          <p className="text-slate-500 mb-1">Control ({100 - e.splitPct}%)</p>
          <p className="font-mono font-medium text-slate-800 truncate">{e.controlModel}</p>
          {ctrl && (
            <div className="mt-1 space-y-0.5 text-slate-600">
              <p>{ctrl.requests.toLocaleString()} requests</p>
              <p>{Math.round(ctrl.avgLatencyMs)}ms avg</p>
              <p>{fmtCost(ctrl.avgCostUsd)} avg</p>
            </div>
          )}
        </div>
        <div className="bg-blue-50 rounded p-2">
          <p className="text-blue-600 mb-1">Treatment ({e.splitPct}%)</p>
          <p className="font-mono font-medium text-slate-800 truncate">{e.treatmentModel}</p>
          {trt && (
            <div className="mt-1 space-y-0.5 text-slate-600">
              <p>{trt.requests.toLocaleString()} requests</p>
              <p className={latencyDelta !== null ? (latencyDelta < 0 ? "text-green-700" : "text-red-700") : ""}>
                {Math.round(trt.avgLatencyMs)}ms avg
                {latencyDelta !== null && ` (${latencyDelta > 0 ? "+" : ""}${Math.round(latencyDelta)}ms)`}
              </p>
              <p className={costDelta !== null ? (costDelta < 0 ? "text-green-700" : "text-red-700") : ""}>
                {fmtCost(trt.avgCostUsd)} avg
                {costDelta !== null && ` (${costDelta > 0 ? "+" : ""}${costDelta.toFixed(1)}%)`}
              </p>
            </div>
          )}
        </div>
      </div>

      {!hasData && (
        <p className="text-xs text-slate-400 italic">No traffic yet — routing requests will start appearing here.</p>
      )}

      {e.winnerVariant && (
        <p className="text-xs text-green-700 font-medium">
          Winner: {e.winnerVariant} ({e.winnerVariant === "control" ? e.controlModel : e.treatmentModel})
        </p>
      )}
    </div>
  );
}

export function ABExperimentsCard() {
  const [experiments, setExperiments] = useState<ExperimentWithResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = statusFilter === "active" ? "?status=active" : "";
    fetch(`/api/smartrouter/experiments${params}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d.error) throw new Error(d.error);
        // Fetch results for each experiment in parallel
        const withResults = await Promise.all(
          (d.experiments as Experiment[]).map(async (exp) => {
            const res = await fetch(`/api/smartrouter/experiments/${exp.id}`);
            const data = await res.json();
            return { experiment: exp, results: data.results ?? {} } as ExperimentWithResults;
          })
        );
        setExperiments(withResults);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">A/B Experiments</CardTitle>
        <div className="flex gap-1">
          {(["active", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`text-xs px-2 py-1 rounded border capitalize ${
                statusFilter === f
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        )}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && experiments.length === 0 && (
          <div className="py-6 text-center text-slate-500 text-sm">
            <p className="font-medium mb-1">No {statusFilter === "active" ? "active " : ""}experiments</p>
            <p className="text-xs">
              Create an experiment via the API to split traffic between two models
              and compare cost, latency, and quality side by side.
            </p>
          </div>
        )}

        {!loading && !error && experiments.map((exp) => (
          <ExperimentRow key={exp.experiment.id} exp={exp} />
        ))}
      </CardContent>
    </Card>
  );
}
