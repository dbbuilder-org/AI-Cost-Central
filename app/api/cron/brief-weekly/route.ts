/**
 * GET /api/cron/brief-weekly
 *
 * Sends the weekly spend brief — runs at 09:00 UTC every Monday.
 * Only fires if BRIEF_WEEKLY_ENABLED=true.
 * Protected by x-cron-secret header.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import { computeWeeklyData } from "@/lib/briefs/data";
import { sendWeeklyBrief } from "@/lib/briefs/render-weekly";
import { loadBriefConfig } from "@/lib/briefs/config";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = loadBriefConfig();

  if (!config.weeklyEnabled) {
    return NextResponse.json({ skipped: true, reason: "BRIEF_WEEKLY_ENABLED not set" });
  }

  if (config.recipients.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No recipients configured" });
  }

  const startedAt = new Date().toISOString();

  try {
    const rows = await fetchAllUsageRows();
    if (rows.length === 0) {
      return NextResponse.json({ success: false, reason: "No usage data", startedAt });
    }

    const data = computeWeeklyData(rows);
    const result = await sendWeeklyBrief(data, config);

    return NextResponse.json({
      success: result.sent,
      error: result.error,
      recipients: config.recipients,
      weekLabel: data.weekLabel,
      totalCostUSD: data.thisWeek.totalCostUSD,
      changePct: data.priorWeek.changePct,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/brief-weekly]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
