"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { ModelSummary } from "@/types";
import { getModelColor, getProvider, abbreviateModel, PROVIDER_LOGO_CONFIG } from "@/lib/modelDisplay";

interface Props {
  byModel: ModelSummary[];
}

interface BarEntry {
  model: string;       // abbreviated — shown on YAxis
  fullModel: string;   // full model ID — shown in tooltip
  provider: string;
  color: string;
  costUSD: number;
  requests: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BarEntry; value: number }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  const cfg = PROVIDER_LOGO_CONFIG[getProvider(entry.fullModel)];
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[180px]">
      {/* Provider badge + full model name */}
      <div className="flex items-center gap-1.5 mb-2">
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
          <rect width="14" height="14" rx="3" fill={cfg.bg} />
          <text
            x="7" y="10.5"
            fontSize={cfg.text.length > 1 ? "5.5" : "8"}
            fontWeight="700" fill="white" textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            {cfg.text}
          </text>
        </svg>
        <span className="text-gray-200 font-medium">{entry.fullModel}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-gray-400">Cost</span>
        <span className="text-white font-semibold tabular-nums">${entry.costUSD.toFixed(4)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="text-gray-400">Requests</span>
        <span className="text-white tabular-nums">{entry.requests}</span>
      </div>
    </div>
  );
}

// Custom YAxis tick: provider badge + abbreviated name
function makeModelTick(data: BarEntry[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function ModelTick(props: any) {
    const x: number = typeof props.x === "number" ? props.x : 0;
    const y: number = typeof props.y === "number" ? props.y : 0;
    const label: string = props.payload?.value ?? "";
    const entry = data.find((d) => d.model === label);
    const provider = entry ? getProvider(entry.fullModel) : "unknown";
    const cfg = PROVIDER_LOGO_CONFIG[provider];

    return (
      <g transform={`translate(${x},${y})`}>
        {/* Provider badge */}
        <rect x={-82} y={-7} width={13} height={13} rx={2} fill={cfg.bg} />
        <text
          x={-82 + 6.5}
          y={-7 + 10}
          fontSize={cfg.text.length > 1 ? 4.5 : 7}
          fontWeight="700"
          fill="white"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
        >
          {cfg.text}
        </text>
        {/* Abbreviated name */}
        <text
          x={-65}
          y={4}
          textAnchor="start"
          fontSize={11}
          fill="#9ca3af"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      </g>
    );
  };
}

export function CostByModel({ byModel }: Props) {
  const data: BarEntry[] = byModel.slice(0, 10).map((m) => ({
    model: abbreviateModel(m.model),
    fullModel: m.model,
    provider: getProvider(m.model),
    color: getModelColor(m.model),
    costUSD: parseFloat(m.costUSD.toFixed(4)),
    requests: m.requests.toLocaleString(),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 90, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
        <YAxis
          type="category"
          dataKey="model"
          width={90}
          tick={makeModelTick(data)}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1f2937" }} />
        <Bar dataKey="costUSD" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
