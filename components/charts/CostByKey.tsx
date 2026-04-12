"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { KeySummary } from "@/types";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

interface Props {
  byApiKey: KeySummary[];
}

export function CostByKey({ byApiKey }: Props) {
  const data = byApiKey.slice(0, 8).map((k) => ({
    name: k.apiKeyName.length > 20 ? k.apiKeyName.slice(0, 18) + "…" : k.apiKeyName,
    fullName: k.apiKeyName,
    costUSD: parseFloat(k.costUSD.toFixed(4)),
    requests: k.requests.toLocaleString(),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" width={100} />
        <Tooltip
          formatter={(v: number, _n: string, props: { payload?: { fullName?: string } }) => [
            `$${v.toFixed(4)}`,
            props.payload?.fullName ?? _n,
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
