/**
 * GET /api/cron/alerts
 *
 * Daily alert cron — runs at 08:00 UTC.
 * Detects anomalies, enriches with AI, sends email digest if any found.
 * Protected by CRON_SECRET header (same secret as /api/cron/refresh).
 */

import { NextRequest, NextResponse } from "next/server";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import { sendAlertEmail } from "@/lib/alerts/email";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import { sendPushNotifications } from "@/lib/alerts/push";
import { sendSlackAlerts } from "@/lib/alerts/slack";
import { deliverWebhookEvent } from "@/lib/webhooks/deliver";
import type { Alert } from "@/types/alerts";

async function invalidateAlertsCache() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return;
  try {
    const { kv } = await import("@vercel/kv");
    await kv.del("alerts:latest");
  } catch {
    // Non-fatal
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  let alerts: Alert[] = [];
  let emailResult: { sent: boolean; error?: string } = { sent: false };

  try {
    const rows = await fetchAllUsageRows();

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        alertCount: 0,
        emailSent: false,
        message: "No usage data available",
        startedAt,
      });
    }

    const detections = detectAll(rows);
    const today = new Date().toISOString().slice(0, 10);
    alerts = await enrichWithAI(detections, today);

    // Bust cache so next /api/alerts call gets fresh data
    await invalidateAlertsCache();

    // Send email + push only if there are alerts
    let pushResult: { sent: number; failed: number } = { sent: 0, failed: 0 };
    let slackResult: { sent: boolean; error?: string } = { sent: false };
    if (alerts.length > 0) {
      [emailResult, pushResult, slackResult] = (await Promise.all([
        sendAlertEmail(alerts),
        sendPushNotifications(alerts),
        sendSlackAlerts(alerts),
        deliverWebhookEvent("alert.fired", { alerts, count: alerts.length }).catch(() => undefined),
      ])).slice(0, 3) as [typeof emailResult, typeof pushResult, typeof slackResult];
    }

    return NextResponse.json({
      success: true,
      alertCount: alerts.length,
      bySeverity: {
        critical: alerts.filter((a) => a.severity === "critical").length,
        warning: alerts.filter((a) => a.severity === "warning").length,
        info: alerts.filter((a) => a.severity === "info").length,
      },
      emailSent: emailResult.sent,
      emailError: emailResult.error,
      slackSent: slackResult.sent,
      slackError: slackResult.error,
      pushSent: pushResult.sent,
      pushFailed: pushResult.failed,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cron alert failed";
    console.error("[cron/alerts]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
