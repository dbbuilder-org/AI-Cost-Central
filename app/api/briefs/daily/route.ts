/**
 * GET /api/briefs/daily
 *
 * Returns the daily brief as JSON (for preview/testing).
 * Add ?send=1 to also trigger an email send.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import { computeDailyData } from "@/lib/briefs/data";
import { renderDailyEmail, sendDailyBrief } from "@/lib/briefs/render-daily";
import { loadBriefConfig } from "@/lib/briefs/config";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import type { Alert } from "@/types/alerts";

export async function GET(req: NextRequest) {
  const shouldSend = req.nextUrl.searchParams.get("send") === "1";

  const rows = await fetchAllUsageRows();
  const data = computeDailyData(rows);
  const config = loadBriefConfig();

  let alerts: Alert[] = [];
  if (config.anomalyEnabled || shouldSend) {
    const detections = detectAll(rows);
    const today = new Date().toISOString().slice(0, 10);
    alerts = await enrichWithAI(detections, today);
  }

  let sendResult: { sent: boolean; error?: string } | null = null;
  if (shouldSend) {
    sendResult = await sendDailyBrief(data, alerts, config);
  }

  return NextResponse.json({
    data,
    alertCount: alerts.length,
    config: {
      dailyEnabled: config.dailyEnabled,
      recipients: config.recipients,
      anomalyEnabled: config.anomalyEnabled,
    },
    send: sendResult,
    html: shouldSend ? undefined : renderDailyEmail(data, alerts, config.dashboardUrl),
  });
}
