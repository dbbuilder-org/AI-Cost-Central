/**
 * GET /api/dashboard/summary
 *
 * Returns a pre-computed spend summary for mobile/external consumers.
 * Pulls from all 3 providers, merges rows, and returns structured cards.
 *
 * ?days=7|14|28  (default 28)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import { buildSummary } from "@/lib/transform";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const days = Math.min(28, Math.max(1, parseInt(params.get("days") ?? "28", 10)));

  try {
    const rows = await fetchAllUsageRows();
    const summary = buildSummary(rows, days);

    // Also compute previous period for change %
    const prevRows = rows; // same rows, different window
    const prevSummary = buildSummary(prevRows, days * 2);
    const prevCost = prevSummary.totalCostUSD - summary.totalCostUSD;

    const changePct = prevCost > 0
      ? ((summary.totalCostUSD - prevCost) / prevCost) * 100
      : 0;

    return NextResponse.json({
      totalCostUSD: summary.totalCostUSD,
      totalRequests: summary.totalRequests,
      changePct: Math.round(changePct * 10) / 10,
      byDay: summary.byDay,
      byModel: summary.byModel.slice(0, 10), // top 10
      byApiKey: summary.byApiKey,
      periodDays: days,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch summary";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
