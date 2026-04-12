"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { ModelSummary } from "@/types";

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

interface Props {
  byModel: ModelSummary[];
}

export function CostByModel({ byModel }: Props) {
  const data = byModel.slice(0, 10).map((m) => ({
    model: m.model.replace("gpt-", "").replace("-preview", ""),
    fullModel: m.model,
    costUSD: parseFloat(m.costUSD.toFixed(4)),
    requests: m.requests.toLocaleString(),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
        <YAxis type="category" dataKey="model" tick={{ fontSize: 11 }} stroke="#9ca3af" width={80} />
        <Tooltip
          formatter={(v, _n, props) => [
            `$${Number(v).toFixed(4)}`,
            (props.payload as { fullModel?: string })?.fullModel ?? String(_n),
          ]}
          labelFormatter={() => ""}
        />
        <Bar dataKey="costUSD" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
