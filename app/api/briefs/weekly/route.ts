/**
 * GET /api/briefs/weekly
 *
 * Returns the weekly brief as JSON (for preview/testing).
 * Add ?send=1 to also trigger an email send.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import { computeWeeklyData } from "@/lib/briefs/data";
import { renderWeeklyEmail, sendWeeklyBrief } from "@/lib/briefs/render-weekly";
import { loadBriefConfig } from "@/lib/briefs/config";

export async function GET(req: NextRequest) {
  const shouldSend = req.nextUrl.searchParams.get("send") === "1";

  const rows = await fetchAllUsageRows();
  const data = computeWeeklyData(rows);
  const config = loadBriefConfig();

  let sendResult: { sent: boolean; error?: string } | null = null;
  if (shouldSend) {
    sendResult = await sendWeeklyBrief(data, config);
  }

  return NextResponse.json({
    data,
    config: {
      weeklyEnabled: config.weeklyEnabled,
      recipients: config.recipients,
    },
    send: sendResult,
    html: shouldSend ? undefined : renderWeeklyEmail(data, config.dashboardUrl),
  });
}
