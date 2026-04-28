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

interface Project {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  paused:    "bg-amber-100 text-amber-800",
  concluded: "bg-slate-100 text-slate-600",
};

function fmtCost(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
}

function ExperimentRow({
  exp,
  onStatusChange,
  onDelete,
}: {
  exp: ExperimentWithResults;
  onStatusChange: (id: string, status: string, winnerVariant?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { experiment: e, results } = exp;
  const ctrl = results["control"];
  const trt = results["treatment"];
  const hasData = ctrl || trt;
  const [acting, setActing] = useState(false);

  const costDelta = ctrl && trt
    ? ((trt.avgCostUsd - ctrl.avgCostUsd) / (ctrl.avgCostUsd || 1)) * 100
    : null;

  const latencyDelta = ctrl && trt
    ? trt.avgLatencyMs - ctrl.avgLatencyMs
    : null;

  async function act(fn: () => Promise<void>) {
    setActing(true);
    try { await fn(); } finally { setActing(false); }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{e.name}</p>
          {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[e.status] ?? STATUS_BADGE.concluded}`}>
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

      {/* Action buttons */}
      {e.status !== "concluded" && (
        <div className="flex gap-1.5 pt-1 flex-wrap">
          {e.status === "active" && (
            <button
              disabled={acting}
              onClick={() => act(() => onStatusChange(e.id, "paused"))}
              className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {e.status === "paused" && (
            <button
              disabled={acting}
              onClick={() => act(() => onStatusChange(e.id, "active"))}
              className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {hasData && (
            <>
              <button
                disabled={acting}
                onClick={() => act(() => onStatusChange(e.id, "concluded", "control"))}
                className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
              >
                Control wins
              </button>
              <button
                disabled={acting}
                onClick={() => act(() => onStatusChange(e.id, "concluded", "treatment"))}
                className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
              >
                Treatment wins
              </button>
            </>
          )}
          {!hasData && (
            <button
              disabled={acting}
              onClick={() => act(() => onStatusChange(e.id, "concluded"))}
              className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
            >
              Conclude
            </button>
          )}
          <button
            disabled={acting}
            onClick={() => { if (confirm("Delete this experiment?")) act(() => onDelete(e.id)); }}
            className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

const TASK_TYPE_OPTIONS = [
  "chat", "coding", "reasoning", "extraction",
  "summarization", "classification", "generation",
] as const;

interface CreateForm {
  projectId: string;
  name: string;
  description: string;
  controlModel: string;
  treatmentModel: string;
  splitPct: number;
  taskTypes: string[];
}

const BLANK_FORM: CreateForm = {
  projectId: "",
  name: "",
  description: "",
  controlModel: "",
  treatmentModel: "",
  splitPct: 50,
  taskTypes: [],
};

export function ABExperimentsCard() {
  const [experiments, setExperiments] = useState<ExperimentWithResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(BLANK_FORM);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function loadExperiments() {
    setLoading(true);
    setError(null);
    const params = statusFilter === "active" ? "?status=active" : "";
    fetch(`/api/smartrouter/experiments${params}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (d.error) throw new Error(d.error);
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
  }

  useEffect(() => { loadExperiments(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showForm && projects.length === 0) {
      fetch("/api/org/projects")
        .then((r) => r.json())
        .then((d) => setProjects((d.projects as Project[]) ?? []))
        .catch(() => {});
    }
  }, [showForm]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/smartrouter/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          splitPct: Number(form.splitPct),
          taskTypes: form.taskTypes,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setShowForm(false);
      setForm(BLANK_FORM);
      loadExperiments();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(id: string, status: string, winnerVariant?: string) {
    const body: Record<string, unknown> = { status };
    if (winnerVariant) body.winnerVariant = winnerVariant;
    await fetch(`/api/smartrouter/experiments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    loadExperiments();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/smartrouter/experiments/${id}`, { method: "DELETE" });
    loadExperiments();
  }

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
          <button
            onClick={() => { setShowForm((v) => !v); setCreateError(null); }}
            className="text-xs px-2 py-1 rounded border bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 ml-1"
          >
            {showForm ? "Cancel" : "+ New"}
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="border border-indigo-200 rounded-lg p-3 space-y-3 bg-indigo-50">
            <p className="text-xs font-semibold text-indigo-800">New A/B Experiment</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-slate-600">Project *</label>
                <select
                  required
                  value={form.projectId}
                  onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                  className="w-full mt-0.5 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600">Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. GPT-4.1-mini vs Claude Haiku"
                  className="w-full mt-0.5 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full mt-0.5 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Control model *</label>
                  <input
                    required
                    value={form.controlModel}
                    onChange={(e) => setForm((f) => ({ ...f, controlModel: e.target.value }))}
                    placeholder="gpt-4.1-mini"
                    className="w-full mt-0.5 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Treatment model *</label>
                  <input
                    required
                    value={form.treatmentModel}
                    onChange={(e) => setForm((f) => ({ ...f, treatmentModel: e.target.value }))}
                    placeholder="claude-haiku-4-5-20251001"
                    className="w-full mt-0.5 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600">Treatment traffic % (1–99, default 50)</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={form.splitPct}
                  onChange={(e) => setForm((f) => ({ ...f, splitPct: parseInt(e.target.value, 10) || 50 }))}
                  className="w-full mt-0.5 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600">
                Task types{" "}
                <span className="text-slate-400">(leave blank to apply to all)</span>
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {TASK_TYPE_OPTIONS.map((t) => {
                  const checked = form.taskTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          taskTypes: checked
                            ? f.taskTypes.filter((x) => x !== t)
                            : [...f.taskTypes, t],
                        }))
                      }
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        checked
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            {createError && <p className="text-xs text-red-600">{createError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="w-full py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create experiment"}
            </button>
          </form>
        )}

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
              Click <strong>+ New</strong> to split traffic between two models and compare cost, latency, and quality.
            </p>
          </div>
        )}

        {!loading && !error && experiments.map((exp) => (
          <ExperimentRow
            key={exp.experiment.id}
            exp={exp}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        ))}
      </CardContent>
    </Card>
  );
}
