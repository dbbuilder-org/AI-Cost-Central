"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Decision {
  id: string;
  createdAt: string;
  projectId: string;
  modelRequested: string;
  modelUsed: string;
  providerUsed: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  savingsUsd: number;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const TASK_COLORS: Record<string, string> = {
  chat:           "bg-blue-900/40 text-blue-300 border-blue-800",
  coding:         "bg-purple-900/40 text-purple-300 border-purple-800",
  reasoning:      "bg-amber-900/40 text-amber-300 border-amber-800",
  extraction:     "bg-cyan-900/40 text-cyan-300 border-cyan-800",
  classification: "bg-green-900/40 text-green-300 border-green-800",
  summarization:  "bg-teal-900/40 text-teal-300 border-teal-800",
  generation:     "bg-pink-900/40 text-pink-300 border-pink-800",
  embedding:      "bg-orange-900/40 text-orange-300 border-orange-800",
  vision:         "bg-rose-900/40 text-rose-300 border-rose-800",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OAI", anthropic: "ANT", google: "GGL",
  groq: "GROQ", mistral: "MST",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return <span>just now</span>;
  if (diffMin < 60) return <span>{diffMin}m ago</span>;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return <span>{diffHr}h ago</span>;
  return <span>{d.toLocaleDateString()}</span>;
}

export function RoutingDecisionsTable() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("");
  const [successFilter, setSuccessFilter] = useState<string>("");
  const LIMIT = 25;

  const load = useCallback(async (newOffset = 0, taskType = taskTypeFilter, success = successFilter) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: LIMIT.toString(), offset: newOffset.toString(), days: "28" });
    if (taskType) params.set("taskType", taskType);
    if (success) params.set("success", success);
    try {
      const res = await fetch(`/api/smartrouter/decisions?${params}`);
      const data = await res.json() as { decisions: Decision[]; pagination: Pagination; error?: string };
      if (data.error) { setError(data.error); return; }
      setDecisions(data.decisions);
      setPagination(data.pagination);
      setOffset(newOffset);
    } catch {
      setError("Failed to load routing decisions");
    } finally {
      setLoading(false);
    }
  }, [taskTypeFilter, successFilter]);

  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => load(0);

  if (loading && decisions.length === 0) {
    return <Skeleton className="h-64 bg-gray-800 w-full rounded-lg" />;
  }

  if (error) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="py-8 text-center text-red-400 text-sm">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-white text-base">Routing Decisions</CardTitle>
            <CardDescription className="text-gray-400 text-xs mt-0.5">
              Last 28 days · {pagination?.total ?? 0} total requests
            </CardDescription>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={taskTypeFilter}
              onChange={(e) => setTaskTypeFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All tasks</option>
              {["chat","coding","reasoning","extraction","classification","summarization","generation","embedding","vision"]
                .map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={successFilter}
              onChange={(e) => setSuccessFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All results</option>
              <option value="true">Success only</option>
              <option value="false">Errors only</option>
            </select>
            <button
              onClick={applyFilters}
              className="px-3 py-1 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded transition-colors"
            >
              Filter
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {decisions.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            No routing decisions yet.{" "}
            <span className="text-gray-600">Point your API calls at /v1/chat/completions to see them here.</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left px-4 py-2 font-medium">When</th>
                    <th className="text-left px-4 py-2 font-medium">Task</th>
                    <th className="text-left px-4 py-2 font-medium">Requested</th>
                    <th className="text-left px-4 py-2 font-medium">Used</th>
                    <th className="text-right px-4 py-2 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                    <th className="text-right px-4 py-2 font-medium">Saved</th>
                    <th className="text-right px-4 py-2 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                        <RelativeTime iso={d.createdAt} />
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TASK_COLORS[d.taskType] ?? "bg-gray-800 text-gray-400 border-gray-700"}`}>
                          {d.taskType}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-400 max-w-[140px] truncate" title={d.modelRequested}>
                        {d.modelRequested}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-300 font-mono max-w-[120px] truncate" title={d.modelUsed}>
                            {d.modelUsed}
                          </span>
                          <span className="text-[10px] text-gray-600 uppercase">
                            {PROVIDER_LABELS[d.providerUsed] ?? d.providerUsed}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400 whitespace-nowrap">
                        {fmtTokens(d.inputTokens + d.outputTokens)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300 whitespace-nowrap">
                        {fmt(d.costUsd)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {d.savingsUsd > 0 ? (
                          <span className="text-green-400">{fmt(d.savingsUsd)}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500 whitespace-nowrap">
                        {d.latencyMs > 0 ? `${d.latencyMs}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && (pagination.offset > 0 || pagination.hasMore) && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                <span className="text-xs text-gray-500">
                  Showing {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => load(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0 || loading}
                    className="px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => load(offset + LIMIT)}
                    disabled={!pagination.hasMore || loading}
                    className="px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
