"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  Circle,
  GitBranch,
  FileText,
} from "lucide-react";

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  openai:    { label: "OpenAI",    cls: "bg-indigo-900/60 text-indigo-300 border-indigo-800" },
  anthropic: { label: "Anthropic", cls: "bg-orange-900/60 text-orange-300 border-orange-800" },
  google:    { label: "Google",    cls: "bg-green-900/60 text-green-300 border-green-800" },
};

interface KeyRow {
  providerKeyId: string;
  provider: string;
  displayName: string;
  totalCostUSD: number;
  lastSeen: string;
  context: {
    purpose?: string | null;
    githubRepos?: string[];
    displayName?: string | null;
  } | null;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org/key-contexts/sync", { method: "POST" });
      const data = await res.json() as { keys: KeyRow[] };
      setKeys(data.keys ?? []);
      setSynced(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-sync on first load
  useEffect(() => { sync(); }, [sync]);

  const providers = [...new Set(keys.map((k) => k.provider))];
  const visible = filter === "all" ? keys : keys.filter((k) => k.provider === filter);
  const annotated = keys.filter((k) => k.context?.purpose).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Key Intelligence</h1>
          <p className="text-sm text-gray-400 mt-1">
            Annotate your API keys with purpose, repos, and docs so anomaly alerts have full context.
          </p>
        </div>
        <button
          onClick={sync}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Syncing…" : "Sync Keys"}
        </button>
      </div>

      {/* Stats bar */}
      {synced && keys.length > 0 && (
        <div className="flex items-center gap-6 mb-5 text-sm">
          <span className="text-gray-400">
            <span className="text-white font-medium">{keys.length}</span> keys discovered
          </span>
          <span className="text-gray-400">
            <span className="text-green-400 font-medium">{annotated}</span> annotated
          </span>
          <span className="text-gray-400">
            <span className="text-amber-400 font-medium">{keys.length - annotated}</span> need context
          </span>
        </div>
      )}

      {/* Provider filter */}
      {providers.length > 1 && (
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === "all" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white border border-gray-700"
            }`}
          >
            All
          </button>
          {providers.map((p) => {
            const badge = PROVIDER_BADGE[p] ?? { label: p, cls: "bg-gray-800 text-gray-300 border-gray-700" };
            return (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filter === p ? badge.cls : "text-gray-400 hover:text-white border-gray-700"
                }`}
              >
                {badge.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && keys.length === 0 && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-900 animate-pulse border border-gray-800" />
          ))}
        </div>
      )}

      {/* Keys list */}
      {!loading && synced && visible.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">No keys found. Make sure OPENAI_ADMIN_KEY or ANTHROPIC_ADMIN_KEY is set.</p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((key) => {
            const badge = PROVIDER_BADGE[key.provider] ?? { label: key.provider, cls: "bg-gray-800 text-gray-300 border-gray-700" };
            const isAnnotated = !!key.context?.purpose;
            const name = key.context?.displayName || key.displayName;
            const repoCount = key.context?.githubRepos?.length ?? 0;

            return (
              <Link
                key={key.providerKeyId}
                href={`/keys/${encodeURIComponent(key.providerKeyId)}`}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800/60 transition-all group"
              >
                {/* Annotation status */}
                {isAnnotated
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                }

                {/* Provider badge */}
                <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${badge.cls} flex-shrink-0`}>
                  {badge.label}
                </span>

                {/* Key name + purpose */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{name}</p>
                  {key.context?.purpose ? (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{key.context.purpose}</p>
                  ) : (
                    <p className="text-xs text-amber-600 mt-0.5">No purpose set — click to annotate</p>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-500">
                  {repoCount > 0 && (
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      {repoCount}
                    </span>
                  )}
                  <span className="text-gray-300 font-medium tabular-nums">
                    ${key.totalCostUSD.toFixed(2)}
                    <span className="text-gray-600 font-normal"> /14d</span>
                  </span>
                  <span className="hidden sm:block">Last: {key.lastSeen}</span>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {synced && keys.length > 0 && (
        <p className="mt-6 text-xs text-gray-600 flex items-center gap-4">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-500" /> Annotated</span>
          <span className="flex items-center gap-1.5"><Circle className="w-3 h-3 text-gray-600" /> Needs context</span>
          <span className="flex items-center gap-1.5"><GitBranch className="w-3 h-3" /> Repo count</span>
        </p>
      )}
    </div>
  );
}
