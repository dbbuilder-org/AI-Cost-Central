import * as XLSX from "xlsx";
import type { UsageRow, SpendSummary, Recommendation } from "@/types";

function fmt(n: number, decimals = 2): number {
  return parseFloat(n.toFixed(decimals));
}

export function buildWorkbook(
  rows: UsageRow[],
  summary: SpendSummary,
  recommendations: Recommendation[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Raw Data ──
  const rawData = rows.map((r) => ({
    Date: r.date,
    Provider: r.provider,
    "API Key ID": r.apiKeyId,
    "API Key Name": r.apiKeyName,
    Model: r.model,
    Requests: r.requests,
    "Input Tokens": r.inputTokens,
    "Output Tokens": r.outputTokens,
    "Cost (USD)": fmt(r.costUSD, 6),
    "$/1K Input": fmt(r.costPer1KInput, 4),
    "$/1K Output": fmt(r.costPer1KOutput, 4),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawData), "Raw Data");

  // ── Sheet 2: By Model ──
  const modelData = summary.byModel.map((m) => ({
    Model: m.model,
    "Total Cost (USD)": fmt(m.costUSD),
    "% of Total": fmt((m.costUSD / summary.totalCostUSD) * 100, 1) + "%",
    Requests: m.requests,
    "Input Tokens": m.inputTokens,
    "Output Tokens": m.outputTokens,
    "$/1K Input": fmt(m.costPer1KInput, 4),
    "$/1K Output": fmt(m.costPer1KOutput, 4),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(modelData), "By Model");

  // ── Sheet 3: By API Key ──
  const keyRows: Record<string, string | number>[] = [];
  for (const k of summary.byApiKey) {
    keyRows.push({
      "API Key Name": k.apiKeyName,
      "API Key ID": k.apiKeyId,
      "Total Cost (USD)": fmt(k.costUSD),
      "% of Total": fmt((k.costUSD / summary.totalCostUSD) * 100, 1) + "%",
      Requests: k.requests,
    });
    for (const m of k.byModel) {
      keyRows.push({
        "API Key Name": `  └─ ${m.model}`,
        "API Key ID": "",
        "Total Cost (USD)": fmt(m.costUSD),
        "% of Total": fmt((m.costUSD / k.costUSD) * 100, 1) + "%",
        Requests: m.requests,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(keyRows), "By API Key");

  // ── Sheet 4: Weekly Trend ──
  const trendData = summary.weeklyTrend.map((w) => ({
    Week: w.weekLabel,
    "Start Date": w.startDate,
    "Cost (USD)": fmt(w.costUSD),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendData), "Weekly Trend");

  // ── Sheet 5: Recommendations ──
  if (recommendations.length > 0) {
    const recData = recommendations.map((r) => ({
      Category: r.category,
      Impact: r.impact,
      Finding: r.finding,
      "Recommended Action": r.action,
      Effort: r.effort,
      "Savings Estimate": r.savings_estimate,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recData), "Recommendations");
  }

  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}
