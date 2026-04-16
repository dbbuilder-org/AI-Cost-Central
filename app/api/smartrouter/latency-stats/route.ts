/**
 * GET /api/smartrouter/latency-stats
 *
 * Returns p50/p95 latency per (provider, model) for the last N days.
 * Used by the dashboard Latency tab and by the routing engine warm-up.
 *
 * Query params:
 *   days   — lookback window (default 7, max 30)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, gte, sql, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const days = Math.min(parseInt(searchParams.get("days") ?? "7", 10), 30);
  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const rows = await db
      .select({
        provider: schema.requestLogs.providerUsed,
        modelId: schema.requestLogs.modelUsed,
        p50: sql<string>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)`,
        p95: sql<string>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)`,
        p99: sql<string>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)`,
        avgMs: sql<string>`AVG(latency_ms)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(schema.requestLogs)
      .where(
        and(
          eq(schema.requestLogs.orgId, orgId),
          gte(schema.requestLogs.createdAt, since),
          eq(schema.requestLogs.success, true),
        )
      )
      .groupBy(schema.requestLogs.providerUsed, schema.requestLogs.modelUsed)
      .orderBy(desc(sql`AVG(latency_ms)`));

    const stats = rows
      .filter((r) => parseInt(r.count ?? "0", 10) >= 5) // require 5+ samples
      .map((r) => ({
        provider: r.provider,
        modelId: r.modelId,
        p50Ms: Math.round(parseFloat(r.p50 ?? "0")),
        p95Ms: Math.round(parseFloat(r.p95 ?? "0")),
        p99Ms: Math.round(parseFloat(r.p99 ?? "0")),
        avgMs: Math.round(parseFloat(r.avgMs ?? "0")),
        sampleCount: parseInt(r.count ?? "0", 10),
      }));

    return NextResponse.json({ stats, days });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Latency stats query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
