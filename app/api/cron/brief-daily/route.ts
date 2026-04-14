/**
 * GET /api/cron/brief-daily
 *
 * Sends the daily spend brief — runs at 07:00 UTC every day.
 * Only fires if BRIEF_DAILY_ENABLED=true.
 * Protected by x-cron-secret header.
 *
 * Also detects anomalies to embed in the brief if BRIEF_ANOMALY_ENABLED
 * is true (since this runs before the dedicated anomaly cron at 08:00).
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import { computeDailyData } from "@/lib/briefs/data";
import { sendDailyBrief } from "@/lib/briefs/render-daily";
import { loadBriefConfig } from "@/lib/briefs/config";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import type { Alert } from "@/types/alerts";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = loadBriefConfig();

  if (!config.dailyEnabled) {
    return NextResponse.json({ skipped: true, reason: "BRIEF_DAILY_ENABLED not set" });
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

    const data = computeDailyData(rows);

    // Embed anomaly detection in the brief when anomaly alerts are enabled
    let alerts: Alert[] = [];
    if (config.anomalyEnabled) {
      const detections = detectAll(rows);
      const today = new Date().toISOString().slice(0, 10);
      alerts = await enrichWithAI(detections, today);
    }

    const result = await sendDailyBrief(data, alerts, config);

    return NextResponse.json({
      success: result.sent,
      error: result.error,
      recipients: config.recipients,
      reportDate: data.reportDate,
      totalCostUSD: data.yesterday.totalCostUSD,
      alertCount: alerts.length,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/brief-daily]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
