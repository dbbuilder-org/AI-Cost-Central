/**
 * POST /api/internal/google-budget-alert
 *
 * Webhook called by the GCP Cloud Function whenever a billing budget threshold
 * is crossed for the Gemini / Google AI Studio project.
 *
 * Authentication: x-internal-secret header must match INTERNAL_WEBHOOK_SECRET env var.
 * This endpoint is NOT behind Clerk auth — it is called server-to-server from GCP.
 *
 * On success:
 *   1. Inserts a row into key_alerts (idempotent — deduped per threshold per day)
 *   2. Fires push + SMS notifications via the existing sendAlertNotifications pipeline
 */

import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { sql } from "drizzle-orm";
import { sendAlertNotifications } from "@/lib/notifications";
import type { Alert } from "@/types/alerts";

interface BudgetAlertPayload {
  /** Actual spend this billing period (USD) */
  costAmount: number;
  /** Total budget amount (USD) */
  budgetAmount: number;
  /** Threshold percentage that was crossed, e.g. 75 for 75% */
  thresholdPct: number;
  /** Human-readable budget name from GCP */
  budgetDisplayName: string;
  /** GCP project ID */
  projectId: string;
  /** Pre-computed severity from the Cloud Function */
  severity: "critical" | "warning" | "info";
}

function buildAlertFromPayload(payload: BudgetAlertPayload): Alert {
  const { costAmount, budgetAmount, thresholdPct, budgetDisplayName, projectId, severity } = payload;

  const pct = thresholdPct.toFixed(0);
  const spent = costAmount.toFixed(2);
  const budget = budgetAmount.toFixed(2);

  const subject = `Google AI Studio — ${pct}% of budget`;
  const message =
    thresholdPct >= 100
      ? `Gemini API spend $${spent} has reached the $${budget} hard cap. The API has been disabled.`
      : `Gemini API spend $${spent} has crossed the ${pct}% threshold of your $${budget} budget.`;

  const detail =
    thresholdPct >= 100
      ? `Project ${projectId} reached 100% of the "${budgetDisplayName}" budget ($${spent}/$${budget}). ` +
        `The Generative Language API has been automatically disabled to prevent further charges. ` +
        `Re-enable it at: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com`
      : `Project ${projectId} has spent $${spent} of the $${budget} "${budgetDisplayName}" budget (${pct}%). ` +
        `Review usage at: https://console.cloud.google.com/billing`;

  const investigateSteps: string[] =
    thresholdPct >= 100
      ? [
          "Open GCP Console → APIs & Services → Generative Language API and verify it is disabled",
          "Review recent usage at GCP Console → Billing → Reports → filter by Generative Language API",
          "Check AICostCentral Google usage tab for the models driving the spike",
          "To re-enable: gcloud services enable generativelanguage.googleapis.com --project=" + projectId,
          "Increase the budget in GCP Console → Billing → Budgets & Alerts before re-enabling",
        ]
      : [
          "Check AICostCentral Google usage tab to identify which model is driving spend",
          "Review recent Gemini API calls in your applications",
          "Consider adding per-model quotas at: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas",
          thresholdPct >= 90
            ? "At 90%+ — consider disabling less-critical workloads proactively"
            : "Monitor hourly — next alert fires at the next threshold",
        ];

  return {
    id: "", // filled after DB insert
    type: "cost_spike",
    severity,
    provider: "google",
    subject,
    message,
    detail,
    investigateSteps,
    value: costAmount,
    baseline: budgetAmount,
    changePct: thresholdPct,
    models: [],
    apiKeyId: `google-budget-${pct}`,
    detectedAt: new Date().toISOString().slice(0, 10),
  };
}

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[google-budget-alert] INTERNAL_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const incomingSecret = req.headers.get("x-internal-secret");
  if (!incomingSecret || incomingSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let payload: BudgetAlertPayload;
  try {
    payload = await req.json() as BudgetAlertPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { costAmount, budgetAmount, thresholdPct, budgetDisplayName, projectId, severity } = payload;
  if (
    typeof costAmount !== "number" ||
    typeof budgetAmount !== "number" ||
    typeof thresholdPct !== "number" ||
    !budgetDisplayName ||
    !projectId ||
    !severity
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  // Unique per threshold per day — prevents double-notification if GCP resends
  const providerKeyId = `google-budget-${Math.round(thresholdPct)}`;

  // ── Insert into key_alerts (idempotent) ─────────────────────────────────────
  let insertedId: string | null = null;
  try {
    const [inserted] = await db
      .insert(schema.keyAlerts)
      .values({
        providerKeyId,
        provider: "google",
        alertType: "cost_spike",
        severity,
        subject: `Google AI Studio — ${Math.round(thresholdPct)}% of budget`,
        message:
          thresholdPct >= 100
            ? `Spend $${costAmount.toFixed(2)} reached the $${budgetAmount.toFixed(2)} hard cap. API disabled.`
            : `Spend $${costAmount.toFixed(2)} crossed the ${Math.round(thresholdPct)}% threshold of $${budgetAmount.toFixed(2)} budget.`,
        detail:
          thresholdPct >= 100
            ? `Project ${projectId} hit 100% of "${budgetDisplayName}" budget. Generative Language API was automatically disabled.`
            : `Project ${projectId} reached ${Math.round(thresholdPct)}% of "${budgetDisplayName}" budget ($${costAmount.toFixed(2)}/$${budgetAmount.toFixed(2)}).`,
        investigateSteps: sql`${JSON.stringify(
          thresholdPct >= 100
            ? [
                "Verify API is disabled: GCP Console → APIs & Services → Generative Language API",
                "Review usage: GCP Console → Billing → Reports → Generative Language API",
                "Re-enable when ready: gcloud services enable generativelanguage.googleapis.com --project=" + projectId,
                "Increase budget in GCP Console → Billing → Budgets & Alerts first",
              ]
            : [
                "Open AICostCentral → Google tab to identify spend by model",
                "Review recent Gemini API calls in your applications",
                "Add per-model quotas: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas",
                thresholdPct >= 90 ? "Consider disabling non-critical workloads proactively" : "Monitor — next alert at next threshold",
              ]
        )}::jsonb`,
        value: costAmount.toString(),
        baseline: budgetAmount.toString(),
        changePct: thresholdPct.toString(),
        detectedAt: today,
        aiEnriched: false,
        notifiedAt: null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.keyAlerts.id });

    insertedId = inserted?.id ?? null;
  } catch (err) {
    console.error("[google-budget-alert] DB insert failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // If the row already existed (dedup hit), skip notifications
  if (!insertedId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already notified for this threshold today" });
  }

  // ── Fire notifications ──────────────────────────────────────────────────────
  const alert = buildAlertFromPayload(payload);
  alert.id = insertedId;

  try {
    await sendAlertNotifications([alert]);

    // Mark notified
    await db
      .update(schema.keyAlerts)
      .set({ notifiedAt: new Date() })
      .where(sql`id = ${insertedId}::uuid`);
  } catch (err) {
    // Don't fail the webhook — the alert is already persisted
    console.error("[google-budget-alert] Notification failed:", err);
  }

  console.log(
    `[google-budget-alert] ${Math.round(thresholdPct)}% threshold — $${costAmount.toFixed(2)}/$${budgetAmount.toFixed(2)} — severity=${severity} — notified`
  );

  return NextResponse.json({ ok: true, alertId: insertedId });
}
