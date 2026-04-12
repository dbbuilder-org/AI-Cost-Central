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
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${v.toFixed(2)}`} />
        <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, undefined]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {allModels.map((model, i) => (
          <Area
            key={model}
            type="monotone"
            dataKey={model}
            stackId="1"
            stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
            fill={MODEL_COLORS[i % MODEL_COLORS.length]}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
