"use client";
import type { ModelSummary } from "@/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  byModel: ModelSummary[];
  totalCost: number;
}

const OVERKILL_CONFIG = {
  high:   { label: "High overkill risk",   badge: "bg-red-900/60 text-red-300 border-red-700",    bar: "bg-red-500" },
  medium: { label: "Possible overkill",    badge: "bg-amber-900/60 text-amber-300 border-amber-700", bar: "bg-amber-400" },
  low:    { label: "Monitor",              badge: "bg-yellow-900/40 text-yellow-400 border-yellow-700", bar: "bg-yellow-500" },
  none:   { label: "Efficient tier",       badge: "bg-gray-800 text-gray-400 border-gray-700",    bar: "bg-indigo-500" },
};

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(0);
}

function fmtUSD(n: number): string {
  if (n < 0.001) return `$${(n * 1000).toFixed(3)}m`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function RequestEfficiency({ byModel, totalCost }: Props) {
  const maxAvgTotal = Math.max(...byModel.map((m) => m.avgTotalTokens), 1);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-gray-500">Overkill signal:</span>
        {(["high", "medium", "low", "none"] as const).map((k) => (
          <Badge key={k} variant="outline" className={`text-xs ${OVERKILL_CONFIG[k].badge}`}>
            {OVERKILL_CONFIG[k].label}
          </Badge>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Frontier models (gpt-4o, gpt-4.1, o-series) flagged when avg tokens/request is low or output is minimal — indicating a cheaper model could handle the task.
      </p>

      {/* Table */}
      <div className="space-y-2">
        {byModel.map((m) => {
          const cfg = OVERKILL_CONFIG[m.overkillSignal];
          const barWidth = Math.max(2, (m.avgTotalTokens / maxAvgTotal) * 100);
          const inputPct = m.avgTotalTokens > 0 ? (m.avgInputTokens / m.avgTotalTokens) * 100 : 0;
          const outputPct = 100 - inputPct;

          return (
            <div key={m.model} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sm text-gray-200 truncate">{m.model}</span>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </Badge>
                </div>
                <span className="text-white font-semibold text-sm flex-shrink-0">${m.costUSD.toFixed(2)}</span>
              </div>

              {/* Avg tokens bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Avg tokens/request</span>
                  <span className="text-gray-300 font-medium">{fmt(m.avgTotalTokens)} total</span>
                </div>
                <div className="h-4 bg-gray-800 rounded overflow-hidden flex" style={{ width: "100%" }}>
                  <div
                    className="bg-blue-600/70 h-full"
                    style={{ width: `${(barWidth * inputPct) / 100}%` }}
                    title={`Input: ${fmt(m.avgInputTokens)} tokens`}
                  />
                  <div
                    className="bg-indigo-400/80 h-full"
                    style={{ width: `${(barWidth * outputPct) / 100}%` }}
                    title={`Output: ${fmt(m.avgOutputTokens)} tokens`}
                  />
                </div>
                <div className="flex gap-4 text-xs text-gray-500 mt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-blue-600/70 inline-block" />
                    Input {fmt(m.avgInputTokens)}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-indigo-400/80 inline-block" />
                    Output {fmt(m.avgOutputTokens)}
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">Requests</p>
                  <p className="text-gray-200 font-medium">{m.requests.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Cost/request</p>
                  <p className="text-gray-200 font-medium">{fmtUSD(m.costPerRequest)}</p>
                </div>
                <div>
                  <p className="text-gray-500">In:Out ratio</p>
                  <p className={`font-medium ${m.inputOutputRatio > 15 ? "text-amber-400" : "text-gray-200"}`}>
                    {m.inputOutputRatio > 0 ? `${m.inputOutputRatio}:1` : "—"}
                    {m.inputOutputRatio > 15 && " ⚠"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">% of spend</p>
                  <p className="text-gray-200 font-medium">
                    {totalCost > 0 ? ((m.costUSD / totalCost) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>

              {/* Overkill call-out */}
              {m.overkillSignal !== "none" && (
                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-400">
                  {m.overkillSignal === "high" && m.avgTotalTokens < 300 && (
                    <span>⚡ Avg {fmt(m.avgTotalTokens)} tokens/req on a frontier model — <strong className="text-amber-400">gpt-4o-mini</strong> handles tasks this size at ~10x lower cost.</span>
                  )}
                  {m.overkillSignal === "high" && m.avgOutputTokens < 20 && (
                    <span>⚡ Avg output is only {fmt(m.avgOutputTokens)} tokens — likely a classification or short-answer task that doesn't need frontier reasoning.</span>
                  )}
                  {m.overkillSignal === "medium" && (
                    <span>💡 Mid-range token volume on a premium model — consider A/B testing <strong className="text-amber-400">gpt-4o-mini</strong> for quality vs cost.</span>
                  )}
                  {m.inputOutputRatio > 15 && (
                    <span className="block mt-1">📄 High input:output ratio ({m.inputOutputRatio}:1) — consider trimming context windows, using RAG with smaller chunks, or caching repeated context.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
