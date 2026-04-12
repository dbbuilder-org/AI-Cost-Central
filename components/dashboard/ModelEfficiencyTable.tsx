"use client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { ModelSummary } from "@/types";

interface Props {
  byModel: ModelSummary[];
  totalCost: number;
}

function colorByCost(val: number, max: number): string {
  if (max === 0) return "text-gray-400";
  const ratio = val / max;
  if (ratio > 0.66) return "text-red-400";
  if (ratio > 0.33) return "text-amber-400";
  return "text-green-400";
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export function ModelEfficiencyTable({ byModel, totalCost }: Props) {
  const maxCostPer1K = Math.max(...byModel.map((m) => m.costPer1KOutput), 0);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-800 hover:bg-transparent">
            <TableHead className="text-gray-400">Model</TableHead>
            <TableHead className="text-gray-400 text-right">Requests</TableHead>
            <TableHead className="text-gray-400 text-right">Input Tokens</TableHead>
            <TableHead className="text-gray-400 text-right">Output Tokens</TableHead>
            <TableHead className="text-gray-400 text-right">Total Cost</TableHead>
            <TableHead className="text-gray-400 text-right">% of Total</TableHead>
            <TableHead className="text-gray-400 text-right">$/1K In</TableHead>
            <TableHead className="text-gray-400 text-right">$/1K Out</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {byModel.map((m) => (
            <TableRow key={m.model} className="border-gray-800 hover:bg-gray-800/50">
              <TableCell className="font-mono text-sm text-gray-200">{m.model}</TableCell>
              <TableCell className="text-right text-gray-300">{fmtNum(m.requests)}</TableCell>
              <TableCell className="text-right text-gray-300">{fmtNum(m.inputTokens)}</TableCell>
              <TableCell className="text-right text-gray-300">{fmtNum(m.outputTokens)}</TableCell>
              <TableCell className="text-right text-white font-semibold">
                ${m.costUSD.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-gray-400">
                {totalCost > 0 ? ((m.costUSD / totalCost) * 100).toFixed(1) : "0"}%
              </TableCell>
              <TableCell className="text-right text-gray-300 text-xs">
                ${m.costPer1KInput.toFixed(4)}
              </TableCell>
              <TableCell className={`text-right text-xs font-semibold ${colorByCost(m.costPer1KOutput, maxCostPer1K)}`}>
                ${m.costPer1KOutput.toFixed(4)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
