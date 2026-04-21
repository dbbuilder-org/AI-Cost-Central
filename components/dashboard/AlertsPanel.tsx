"use client";
import { useEffect, useState } from "react";
import type { Alert } from "@/types/alerts";

const SEVERITY_COLORS = {
  critical: { dot: "bg-red-500", badge: "bg-red-900/60 text-red-300 border-red-800", text: "text-red-400" },
  warning:  { dot: "bg-amber-500", badge: "bg-amber-900/60 text-amber-300 border-amber-800", text: "text-amber-400" },
  info:     { dot: "bg-indigo-500", badge: "bg-indigo-900/60 text-indigo-300 border-indigo-800", text: "text-indigo-400" },
};

const TYPE_LABELS: Record<Alert["type"], string> = {
  cost_spike:       "Cost Spike",
  cost_drop:        "Cost Drop",
  volume_spike:     "Volume Spike",
  key_model_shift:  "Model Shift",
  new_key:          "New Key",
};

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  openai:    { label: "OAI", cls: "bg-indigo-900/60 text-indigo-300" },
  anthropic: { label: "ANT", cls: "bg-orange-900/60 text-orange-300" },
  google:    { label: "GGL", cls: "bg-green-900/60 text-green-300" },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AlertRow({ alert }: { alert: Alert }) {
  const [expanded, setExpanded] = useState(false);
  const colors = SEVERITY_COLORS[alert.severity];
  const provider = PROVIDER_BADGE[alert.provider];

  return (
    <div className="border-b border-gray-800 last:border-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors flex items-start gap-3"
      >
        <span className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${colors.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${colors.badge}`}>
              {alert.severity.toUpperCase()}
            </span>
            {provider && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${provider.cls}`}>
                {provider.label}
              </span>
            )}
            <span className="text-xs text-gray-500">{TYPE_LABELS[alert.type]}</span>
            <span className="text-xs text-gray-600">{fmtDate(alert.detectedAt)}</span>
          </div>
          <div className="mt-1 text-sm font-medium text-white truncate">{alert.subject}</div>
          <div className="mt-0.5 text-xs text-gray-400 line-clamp-1">{alert.message}</div>
        </div>
        <span className="text-gray-600 text-xs flex-shrink-0 mt-1">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 bg-gray-900/30 border-t border-gray-800">
          <p className="text-sm text-gray-300 mt-3 leading-relaxed">{alert.detail}</p>
          {alert.investigateSteps.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Investigation Steps</p>
              <ol className="space-y-1">
                {alert.investigateSteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400">
                    <span className="text-gray-600 flex-shrink-0 font-mono">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="mt-3 flex gap-4 text-xs text-gray-600">
            <span>Current: <strong className={colors.text}>${alert.value.toFixed(2)}</strong></span>
            <span>Baseline: <strong className="text-gray-400">${alert.baseline.toFixed(2)}</strong></span>
            <span>Change: <strong className={alert.changePct > 0 ? "text-red-400" : "text-green-400"}>
              {alert.changePct > 0 ? "+" : ""}{alert.changePct.toFixed(0)}%
            </strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  const load = async (force = false) => {
    if (!force && lastFetched && Date.now() - lastFetched < 300_000) return; // 5 min cache
    setLoading(true);
    setError(null);
    try {
      const url = force ? "/api/alerts?refresh=1" : "/api/alerts";
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(err.error ?? "Failed to load alerts");
      }
      const data = await res.json() as Alert[];
      setAlerts(Array.isArray(data) ? data : []);
      setLastFetched(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bySeverity = {
    critical: alerts.filter((a) => a.severity === "critical"),
    warning: alerts.filter((a) => a.severity === "warning"),
    info: alerts.filter((a) => a.severity === "info"),
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { key: "critical", label: "Critical", color: "bg-red-900/40 text-red-300 border-red-800" },
          { key: "warning",  label: "Warnings", color: "bg-amber-900/40 text-amber-300 border-amber-800" },
          { key: "info",     label: "Info",     color: "bg-indigo-900/40 text-indigo-300 border-indigo-800" },
        ].map(({ key, label, color }) => (
          <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium ${color}`}>
            <span className="text-lg font-bold">{bySeverity[key as keyof typeof bySeverity].length}</span>
            {label}
          </div>
        ))}
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="ml-auto text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40"
        >
          {loading ? "Analyzing…" : "↻ Re-run"}
        </button>
      </div>

      {/* Alert list */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        {loading && (
          <div className="p-6 text-center text-gray-500 text-sm">
            Running anomaly detection across all providers…
          </div>
        )}
        {!loading && error && (
          <div className="p-4 text-sm text-red-300 bg-red-900/20 border-b border-red-800">
            {error}
          </div>
        )}
        {!loading && !error && alerts.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-2xl mb-2">✓</div>
            <div className="text-gray-400 text-sm font-medium">No anomalies detected</div>
            <div className="text-gray-600 text-xs mt-1">All models and keys are within normal usage patterns</div>
          </div>
        )}
        {!loading && alerts.length > 0 && (
          <div>
            {[...bySeverity.critical, ...bySeverity.warning, ...bySeverity.info].map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
