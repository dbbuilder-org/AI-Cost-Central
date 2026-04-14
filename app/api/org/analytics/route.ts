/**
 * GET /api/org/analytics?days=90  — returns usage_rows summary + forecast
 * Requires growth plan (90d) or business plan (365d).
 * Falls back to 28d on free plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { getOrgPlanLimits } from "@/lib/plans";
import { computeForecast } from "@/lib/forecast";

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();

    const { searchParams } = new URL(req.url);
    const requestedDays = parseInt(searchParams.get("days") ?? "28", 10);

    // Enforce plan limit on history days
    const limits = await getOrgPlanLimits(orgId);
    const days = Math.min(requestedDays, limits.historyDays);

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    const startStr = startDate.toISOString().slice(0, 10);

    // Aggregate usage_rows by date
    const rows = await db
      .select({
        date: schema.usageRows.date,
        totalCost: sql<number>`sum(${schema.usageRows.costUsd})::float`,
        totalRequests: sql<number>`sum(${schema.usageRows.requests})::int`,
        totalInputTokens: sql<number>`sum(${schema.usageRows.inputTokens})::bigint`,
        totalOutputTokens: sql<number>`sum(${schema.usageRows.outputTokens})::bigint`,
      })
      .from(schema.usageRows)
      .where(
        and(
          eq(schema.usageRows.orgId, orgId),
          gte(schema.usageRows.date, startStr)
        )
      )
      .groupBy(schema.usageRows.date)
      .orderBy(schema.usageRows.date);

    const byDay = rows.map((r) => ({
      date: r.date,
      costUSD: r.totalCost ?? 0,
      requests: r.totalRequests ?? 0,
    }));

    const totalCostUSD = byDay.reduce((s, d) => s + d.costUSD, 0);

    const forecast = limits.forecastEnabled
      ? computeForecast(byDay)
      : null;

    return NextResponse.json({
      days,
      historyDays: limits.historyDays,
      forecastEnabled: limits.forecastEnabled,
      byDay,
      totalCostUSD,
      forecast,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[GET /api/org/analytics]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
