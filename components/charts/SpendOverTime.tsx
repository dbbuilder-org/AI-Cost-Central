"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DaySummary } from "@/types";
import { getModelColor, getProvider, abbreviateModel, PROVIDER_LOGO_CONFIG } from "@/lib/modelDisplay";

interface Props {
  byDay: DaySummary[];
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const nonZero = payload.filter((p) => p.value > 0);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[180px]">
      <p className="text-gray-400 font-medium mb-2">{label}</p>
      {nonZero.length === 0 && <p className="text-gray-500">No spend</p>}
      {nonZero
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              {/* Tooltip shows the full model ID */}
              <span className="text-gray-300 truncate max-w-[160px]">{p.name}</span>
            </div>
            <span className="text-white font-semibold tabular-nums">
              ${p.value >= 0.01 ? p.value.toFixed(2) : p.value.toFixed(4)}
            </span>
          </div>
        ))}
      {nonZero.length > 1 && (
        <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1.5">
          <span className="text-gray-400">Total</span>
          <span className="text-white font-bold tabular-nums">
            ${nonZero.reduce((s, p) => s + p.value, 0).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// Provider logo as a small SVG badge (14×14px)
function ProviderBadge({ modelId }: { modelId: string }) {
  const provider = getProvider(modelId);
  const cfg = PROVIDER_LOGO_CONFIG[provider];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <rect width="14" height="14" rx="3" fill={cfg.bg} />
      <text
        x="7"
        y="10.5"
        fontSize={cfg.text.length > 1 ? "5.5" : "8"}
        fontWeight="700"
        fill="white"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
      >
        {cfg.text}
      </text>
    </svg>
  );
}

interface LegendPayloadItem {
  value: string;
  color: string;
}

// Custom recharts Legend — shows provider badge + abbreviated model name
function ModelLegend({ payload }: { payload?: LegendPayloadItem[] }) {
  if (!payload?.length) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 14px",
        justifyContent: "center",
        paddingTop: "10px",
      }}
    >
      {payload.map((entry) => (
        <div
          key={entry.value}
          style={{ display: "flex", alignItems: "center", gap: 5, cursor: "default" }}
          title={entry.value}
        >
          <ProviderBadge modelId={entry.value} />
          <span style={{ fontSize: 11, color: entry.color, fontWeight: 500 }}>
            {abbreviateModel(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SpendOverTime({ byDay }: Props) {
  if (!byDay.length) return null;

  const allModels = Array.from(
    new Set(byDay.flatMap((d) => Object.keys(d.byModel)))
  );

  const data = byDay.map((d) => ({
    date: d.date.slice(5), // MM-DD
    ...Object.fromEntries(
      allModels.map((m) => [m, parseFloat((d.byModel[m] ?? 0).toFixed(4))])
    ),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} stroke="#374151" />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} stroke="#374151" tickFormatter={(v) => `$${v.toFixed(2)}`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<ModelLegend />} />
        {allModels.map((model) => {
          const color = getModelColor(model);
          return (
            <Area
              key={model}
              type="monotone"
              dataKey={model}
              stackId="1"
              stroke={color}
              fill={color}
              fillOpacity={0.65}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
