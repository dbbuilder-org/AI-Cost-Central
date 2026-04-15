/**
 * GET /api/smartrouter/stats
 *
 * Returns SmartRouter routing stats for the authenticated org:
 *   - total requests proxied
 *   - total cost saved (USD)
 *   - avg savings %
 *   - breakdown by task type and model
 *   - daily savings trend (last 28 days)
 *
 * Accepts ?days=N (default 28, max 90).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "28"), 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(schema.requestLogs)
    .where(and(
      eq(schema.requestLogs.orgId, orgId),
      gte(schema.requestLogs.createdAt, since),
    ))
    .orderBy(schema.requestLogs.createdAt);

  const totalRequests = rows.length;
  const successfulRows = rows.filter((r) => r.success);
  const totalCostUSD = successfulRows.reduce((s, r) => s + parseFloat(r.costUsd as string), 0);
  const totalSavingsUSD = successfulRows.reduce((s, r) => s + parseFloat(r.savingsUsd as string), 0);
  const totalInputTokens = successfulRows.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = successfulRows.reduce((s, r) => s + r.outputTokens, 0);

  // What would it have cost using the requested models?
  const grossCostUSD = totalCostUSD + totalSavingsUSD;
  const avgSavingsPct = grossCostUSD > 0 ? Math.round((totalSavingsUSD / grossCostUSD) * 100) : 0;

  // By task type
  const byTaskType: Record<string, { requests: number; savingsUSD: number; costUSD: number }> = {};
  for (const r of successfulRows) {
    if (!byTaskType[r.taskType]) byTaskType[r.taskType] = { requests: 0, savingsUSD: 0, costUSD: 0 };
    byTaskType[r.taskType].requests++;
    byTaskType[r.taskType].savingsUSD += parseFloat(r.savingsUsd as string);
    byTaskType[r.taskType].costUSD += parseFloat(r.costUsd as string);
  }

  // By model used
  const byModelUsed: Record<string, { requests: number; savingsUSD: number; costUSD: number }> = {};
  for (const r of successfulRows) {
    if (!byModelUsed[r.modelUsed]) byModelUsed[r.modelUsed] = { requests: 0, savingsUSD: 0, costUSD: 0 };
    byModelUsed[r.modelUsed].requests++;
    byModelUsed[r.modelUsed].savingsUSD += parseFloat(r.savingsUsd as string);
    byModelUsed[r.modelUsed].costUSD += parseFloat(r.costUsd as string);
  }

  // Daily savings trend
  const byDay: Record<string, { requests: number; savingsUSD: number; costUSD: number }> = {};
  for (const r of successfulRows) {
    const date = r.createdAt.toISOString().slice(0, 10);
    if (!byDay[date]) byDay[date] = { requests: 0, savingsUSD: 0, costUSD: 0 };
    byDay[date].requests++;
    byDay[date].savingsUSD += parseFloat(r.savingsUsd as string);
    byDay[date].costUSD += parseFloat(r.costUsd as string);
  }

  const dailyTrend = Object.entries(byDay)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    totalRequests,
    totalCostUSD,
    totalSavingsUSD,
    totalInputTokens,
    totalOutputTokens,
    avgSavingsPct,
    byTaskType,
    byModelUsed,
    dailyTrend,
    days,
    fetchedAt: new Date().toISOString(),
  });
}
