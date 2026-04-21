/**
 * GET /api/cron/daily-digest
 *
 * DB-free daily anomaly + spend digest — runs at 07:00 UTC.
 * Fetches usage directly from provider admin API keys (OPENAI_ADMIN_KEY,
 * ANTHROPIC_ADMIN_KEY) without requiring org records in the database.
 *
 * Sends to BRIEF_RECIPIENTS (comma-separated) or ALERT_EMAIL_TO as fallback.
 * Protected by x-cron-secret header (set CRON_SECRET in Vercel env).
 *
 * What's in the email:
 *  - Yesterday's spend: total, by provider, top models, top API keys
 *  - Day-over-day and 7-day trend comparison
 *  - Anomaly alerts: cost spikes/drops (z-score), volume spikes, new models/keys
 *  - Cost-per-request efficiency table
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAdminUsageRows } from "@/lib/adminUsage";
import { computeDailyData } from "@/lib/briefs/data";
import { sendDailyBrief } from "@/lib/briefs/render-daily";
import { loadBriefConfig } from "@/lib/briefs/config";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import type { Alert } from "@/types/alerts";

export const maxDuration = 60; // provider API calls can be slow

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = loadBriefConfig();

  if (config.recipients.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No recipients configured (set BRIEF_RECIPIENTS or ALERT_EMAIL_TO)",
    });
  }

  const startedAt = new Date().toISOString();

  try {
    // Fetch 14 days: yesterday (complete) + 13 days baseline for anomaly detection
    const rows = await fetchAdminUsageRows(14);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        reason: "No usage data — check OPENAI_ADMIN_KEY and ANTHROPIC_ADMIN_KEY are set",
        startedAt,
      });
    }

    const data = computeDailyData(rows);

    // Anomaly detection — always run, use AI enrichment when available
    const detections = detectAll(rows);
    let alerts: Alert[] = [];
    if (config.anomalyEnabled && detections.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      alerts = await enrichWithAI(detections, today).catch(() =>
        // Fallback to unenriched detections if AI call fails
        detections.map((d) => ({
          ...d,
          id: `${d.provider}-${d.subject}-${d.type}`,
          detectedAt: today,
          detail: d.message,
          investigateSteps: [],
        }))
      );
    }

    const result = await sendDailyBrief(data, alerts, config);

    return NextResponse.json({
      success: result.sent,
      error: result.error,
      recipients: config.recipients,
      reportDate: data.reportDate,
      totalCostUSD: data.yesterday.totalCostUSD,
      rowCount: rows.length,
      alertCount: alerts.length,
      // Debug: show unique key names and alert subjects to verify key-centric grouping
      _debug: {
        uniqueKeys: [...new Set(rows.map((r) => `${r.apiKeyId}|${r.apiKeyName}`))],
        alertSummaries: alerts.map((a) => ({
          type: a.type,
          severity: a.severity,
          subject: a.subject,
          apiKeyId: a.apiKeyId,
          models: a.models,
          message: a.message,
        })),
      },
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/daily-digest]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
