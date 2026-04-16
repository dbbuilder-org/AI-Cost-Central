/**
 * GET /api/smartrouter/openrouter-compare
 *
 * Compares what SmartRouter spent (from request_logs) vs what OpenRouter
 * would have charged for the same requests if routed to the same models.
 *
 * Uses OpenRouter published pricing to estimate OR cost for each model used.
 * Returns aggregated savings and per-model breakdown.
 *
 * Query params:
 *   days    — lookback window (default 30, max 90)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, gte, sql } from "drizzle-orm";

// OpenRouter published pricing ($/1M tokens) as of Apr 2026
// Source: https://openrouter.ai/models — refreshed manually each quarter
const OR_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":                   { input: 2.70, output: 10.80 }, // OR adds ~8% markup
  "gpt-4o-mini":              { input: 0.165, output: 0.66 },
  "gpt-4.1":                  { input: 2.20, output: 8.80 },
  "gpt-4.1-mini":             { input: 0.44, output: 1.76 },
  "gpt-4.1-nano":             { input: 0.11, output: 0.44 },
  "o3-mini":                  { input: 1.21, output: 4.84 },
  "o3":                       { input: 11.00, output: 44.00 },
  "o4-mini":                  { input: 1.21, output: 4.84 },
  "claude-haiku-4-5-20251001":{ input: 1.10, output: 5.50 },
  "claude-sonnet-4-6":        { input: 3.30, output: 16.50 },
  "claude-opus-4-6":          { input: 16.50, output: 82.50 },
  "gemini-2.0-flash":         { input: 0.11, output: 0.44 },
  "gemini-2.5-pro":           { input: 1.375, output: 11.00 },
  "llama-3.3-70b-versatile":  { input: 0.65, output: 0.87 },
  "llama-3.1-8b-instant":     { input: 0.055, output: 0.088 },
  "mixtral-8x7b-32768":       { input: 0.27, output: 0.27 },
  "mistral-large-latest":     { input: 2.20, output: 6.60 },
  "mistral-small-latest":     { input: 0.22, output: 0.66 },
  "command-r-plus":           { input: 2.75, output: 11.00 },
  "command-r":                { input: 0.165, output: 0.66 },
};

function orCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = OR_PRICING[modelId] ?? OR_PRICING[Object.keys(OR_PRICING).find((k) => modelId.startsWith(k)) ?? ""] ?? null;
  if (!pricing) return 0;
  return (pricing.input / 1_000_000) * inputTokens + (pricing.output / 1_000_000) * outputTokens;
}

export async function GET(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const days = Math.min(parseInt(searchParams.get("days") ?? "30", 10), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // Aggregate spend + tokens per model from request_logs
    const rows = await db
      .select({
        modelId: schema.requestLogs.modelUsed,
        totalCostUsd: sql<string>`SUM(cost_usd::numeric)`,
        totalInput: sql<string>`SUM(input_tokens)`,
        totalOutput: sql<string>`SUM(output_tokens)`,
        requestCount: sql<string>`COUNT(*)`,
      })
      .from(schema.requestLogs)
      .where(
        and(
          eq(schema.requestLogs.orgId, orgId),
          gte(schema.requestLogs.createdAt, since),
          eq(schema.requestLogs.success, true),
        )
      )
      .groupBy(schema.requestLogs.modelUsed);

    let totalActual = 0;
    let totalOrEstimate = 0;
    let totalRequests = 0;
    const modelBreakdown = [];

    for (const row of rows) {
      const actualCost = parseFloat(row.totalCostUsd ?? "0");
      const inputTok = parseInt(row.totalInput ?? "0", 10);
      const outputTok = parseInt(row.totalOutput ?? "0", 10);
      const requests = parseInt(row.requestCount ?? "0", 10);
      const orEstimate = orCost(row.modelId, inputTok, outputTok);
      const hasOrPricing = OR_PRICING[row.modelId] !== undefined ||
        Object.keys(OR_PRICING).some((k) => row.modelId.startsWith(k));

      totalActual += actualCost;
      if (hasOrPricing) totalOrEstimate += orEstimate;
      totalRequests += requests;

      modelBreakdown.push({
        modelId: row.modelId,
        requests,
        actualCostUsd: actualCost,
        orEstimateUsd: orEstimate,
        savingsUsd: hasOrPricing ? orEstimate - actualCost : null,
        savingsPct: hasOrPricing && orEstimate > 0
          ? Math.round(((orEstimate - actualCost) / orEstimate) * 100)
          : null,
        orPricingAvailable: hasOrPricing,
      });
    }

    const totalSavings = totalOrEstimate - totalActual;
    const savingsPct = totalOrEstimate > 0 ? Math.round((totalSavings / totalOrEstimate) * 100) : 0;

    return NextResponse.json({
      summary: {
        totalActualUsd: totalActual,
        totalOrEstimateUsd: totalOrEstimate,
        totalSavingsUsd: totalSavings,
        savingsPct,
        totalRequests,
        days,
      },
      byModel: modelBreakdown.sort((a, b) => (b.savingsUsd ?? 0) - (a.savingsUsd ?? 0)),
      note: "OpenRouter estimates use published OR pricing including their markup. Actual savings may vary based on volume discounts.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Comparison query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
