/**
 * GET /api/github/attribution
 *
 * Aggregates request_logs by callsite (X-Source-File header) to show
 * which files/lines are driving AI spend. Returns top callsites with
 * model breakdown and cost, plus lightweight recommendations.
 *
 * Query params:
 *   days    — lookback window (default 30, max 90)
 *   limit   — max callsites returned (default 25, max 100)
 *   projectId — filter to a specific SmartRouter project
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, gte, isNotNull, sql, desc } from "drizzle-orm";

// Models where switching to a cheaper alternative saves >30%
const DOWNGRADE_MAP: Record<string, { to: string; savingsPct: number }> = {
  "gpt-4o":          { to: "gpt-4o-mini",       savingsPct: 94 },
  "gpt-4.1":         { to: "gpt-4.1-mini",       savingsPct: 83 },
  "claude-opus-4":   { to: "claude-sonnet-4-5",  savingsPct: 80 },
  "claude-opus-4-5": { to: "claude-sonnet-4-5",  savingsPct: 80 },
  "o3":              { to: "o4-mini",             savingsPct: 86 },
  "o1":              { to: "o4-mini",             savingsPct: 86 },
};

function buildRecommendation(
  topModel: string,
  totalCostUsd: number,
): string | null {
  const downgrade = DOWNGRADE_MAP[topModel];
  if (!downgrade || totalCostUsd < 0.01) return null;
  const saved = totalCostUsd * (downgrade.savingsPct / 100);
  return `Switch to ${downgrade.to} (≈${downgrade.savingsPct}% cheaper) — saves ~$${saved.toFixed(4)}/period`;
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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100);
  const projectId = searchParams.get("projectId") ?? undefined;

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  try {
    // Aggregate cost + tokens + requests per callsite
    const conditions = [
      eq(schema.requestLogs.orgId, orgId),
      gte(schema.requestLogs.createdAt, new Date(sinceIso)),
      isNotNull(schema.requestLogs.callsite),
    ];
    if (projectId) conditions.push(eq(schema.requestLogs.projectId, projectId));

    const rows = await db
      .select({
        callsite: schema.requestLogs.callsite,
        totalCostUsd: sql<string>`SUM(cost_usd::numeric)`,
        totalInputTokens: sql<string>`SUM(input_tokens)`,
        totalOutputTokens: sql<string>`SUM(output_tokens)`,
        requestCount: sql<string>`COUNT(*)`,
        // Model used most often for this callsite
        topModel: sql<string>`MODE() WITHIN GROUP (ORDER BY model_used)`,
      })
      .from(schema.requestLogs)
      .where(and(...conditions))
      .groupBy(schema.requestLogs.callsite)
      .orderBy(desc(sql`SUM(cost_usd::numeric)`))
      .limit(limit);

    const callsites = rows.map((r) => {
      const cost = parseFloat(r.totalCostUsd ?? "0");
      const recommendation = buildRecommendation(r.topModel ?? "", cost);
      return {
        callsite: r.callsite,
        totalCostUsd: cost,
        totalInputTokens: parseInt(r.totalInputTokens ?? "0", 10),
        totalOutputTokens: parseInt(r.totalOutputTokens ?? "0", 10),
        requestCount: parseInt(r.requestCount ?? "0", 10),
        topModel: r.topModel ?? "unknown",
        recommendation,
      };
    });

    // Aggregate totals for header stats
    const totalCost = callsites.reduce((s, c) => s + c.totalCostUsd, 0);
    const totalRequests = callsites.reduce((s, c) => s + c.requestCount, 0);
    const withRecommendations = callsites.filter((c) => c.recommendation !== null).length;

    return NextResponse.json({
      callsites,
      summary: {
        totalCostUsd: totalCost,
        totalRequests,
        callsiteCount: callsites.length,
        withRecommendations,
        days,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Attribution query failed";
    console.error("[attribution]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
