"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DaySummary } from "@/types";

const MODEL_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

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
              <span className="text-gray-300 truncate max-w-[140px]">{p.name}</span>
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
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {allModels.map((model, i) => (
          <Area
            key={model}
            type="monotone"
            dataKey={model}
            stackId="1"
            stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
            fill={MODEL_COLORS[i % MODEL_COLORS.length]}
            fillOpacity={0.65}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
