/**
 * GET /api/cron/anomaly-check
 *
 * Hourly fast anomaly check — detects new anomalies and fires push/SMS
 * notifications immediately. No AI enrichment (too slow for hourly).
 *
 * Strategy:
 *   1. Fetch 14d usage rows
 *   2. Detect anomalies (stateless, ~100ms)
 *   3. Attempt insert of each as a fallback alert with onConflictDoNothing
 *   4. The DB unique index (providerKeyId, alertType, detectedAt) ensures only
 *      NEW anomalies (not already inserted today) pass through
 *   5. Send push + SMS for newly inserted alerts
 *
 * The daily-digest at 07:00 UTC will later AI-enrich these fallback alerts.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAdminUsageRows } from "@/lib/adminUsage";
import { detectAll } from "@/lib/alerts/detector";
import { loadAlertConfig } from "@/lib/alerts/config";
import { sendAlertNotifications } from "@/lib/notifications";
import { db, schema } from "@/lib/db";
import type { Alert } from "@/types/alerts";
import type { DetectionResult } from "@/types/alerts";

export const maxDuration = 60;

function buildFallbackAlert(result: DetectionResult, date: string): Alert {
  const model = result.models?.[0] ?? "unknown model";
  let detail = result.message;
  switch (result.type) {
    case "cost_spike":
      detail = `API key "${result.subject}" (${result.provider}) cost reached $${result.value.toFixed(2)} — ${result.changePct.toFixed(0)}% above the $${result.baseline.toFixed(2)} baseline. Primary model: ${model}.`;
      break;
    case "cost_drop":
      detail = `API key "${result.subject}" (${result.provider}) spend dropped to $${result.value.toFixed(2)} vs $${result.baseline.toFixed(2)} baseline. Verify the integration is still working.`;
      break;
    case "volume_spike":
      detail = `API key "${result.subject}" (${result.provider}) received ${result.value.toLocaleString()} requests — ${result.changePct.toFixed(0)}% above baseline of ${Math.round(result.baseline).toLocaleString()}/day.`;
      break;
    case "key_model_shift":
      detail = result.models?.length && result.models.length > 1
        ? `API key "${result.subject}" shifted from ${result.models[1]} to ${result.models[0]}.`
        : `API key "${result.subject}" started using ${model} for the first time.`;
      break;
    case "new_key":
      detail = `New API key "${result.subject}" (${result.provider}) detected. Spend so far: $${result.value.toFixed(2)}.`;
      break;
  }
  return {
    ...result,
    id: `${result.provider}-${result.subject}-${result.type}-${date}`,
    detail,
    investigateSteps: [],
    detectedAt: date,
  };
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. Fetch usage data
    const rows = await fetchAdminUsageRows(14);
    if (rows.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No usage data", startedAt });
    }

    // 2. Detect anomalies
    const alertConfig = await loadAlertConfig(undefined);
    const detections = detectAll(rows, alertConfig);
    if (detections.length === 0) {
      return NextResponse.json({ newAlerts: 0, startedAt, finishedAt: new Date().toISOString() });
    }

    // 3. Try to insert each as a fallback alert — only new ones succeed
    const newAlerts: Alert[] = [];

    for (const detection of detections) {
      const alert = buildFallbackAlert(detection, today);
      try {
        const inserted = await db
          .insert(schema.keyAlerts)
          .values({
            providerKeyId: detection.apiKeyId ?? detection.subject,
            provider: detection.provider,
            alertType: detection.type,
            severity: detection.severity,
            subject: detection.subject,
            message: detection.message,
            detail: alert.detail ?? "",
            investigateSteps: [] as unknown as Record<string, unknown>,
            value: String(detection.value ?? 0),
            baseline: String(detection.baseline ?? 0),
            changePct: String(detection.changePct ?? 0),
            models: detection.models ?? [],
            detectedAt: today,
            aiEnriched: false,
            notifiedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: schema.keyAlerts.id });

        if (inserted.length > 0) {
          // Newly inserted — fire notification
          newAlerts.push({ ...alert, id: inserted[0].id });
        }
      } catch (err) {
        console.warn("[anomaly-check] Failed to insert alert:", detection.subject, err);
      }
    }

    // 4. Send push + SMS for new alerts
    if (newAlerts.length > 0) {
      await sendAlertNotifications(newAlerts);
    }

    return NextResponse.json({
      detected: detections.length,
      newAlerts: newAlerts.length,
      notified: newAlerts.map((a) => ({ subject: a.subject, type: a.type, severity: a.severity })),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/anomaly-check]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
