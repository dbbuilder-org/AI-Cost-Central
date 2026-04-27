/**
 * GET /api/cron/render-inventory
 *
 * Runs every 15 minutes. Polls the Render API for all services in the
 * workspace and alerts on any new service from an unknown GitHub repo.
 *
 * This catches the attack pattern where an attacker with a stolen Render
 * session deploys their own service (proxy, relay, bastion) inside your
 * workspace. Without this monitor, rogue services can run for days.
 *
 * New services are inserted into render_services with isKnown=false.
 * Mark them as known via the dashboard or by setting isKnown=true in the DB.
 *
 * Configure trusted GitHub orgs via KNOWN_GITHUB_OWNERS env var (comma-sep).
 */

import { NextRequest, NextResponse } from "next/server";
import { scanRenderServices } from "@/lib/security/renderMonitor";
import { sendAlertNotifications } from "@/lib/notifications";
import type { Alert } from "@/types/alerts";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const anomalies = await scanRenderServices();

    if (anomalies.length === 0) {
      return NextResponse.json({
        anomalies: 0,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }

    // Convert anomalies to Alert shape for notification pipeline
    const alerts: Alert[] = anomalies.map((a) => ({
      id: `render-service-${a.serviceId}-${today}`,
      type: "render_service_anomaly",
      severity: "critical",
      provider: "render",
      subject: a.name,
      apiKeyId: a.serviceId,
      models: [],
      message: `Unknown Render service detected: "${a.name}" (${a.repoOwner ?? "no repo"}/${a.repoName ?? "unknown"}) — ${a.reason}`,
      detail: [
        `A new Render service was detected in your workspace that was not previously known.`,
        `Service: ${a.name}`,
        `GitHub repo: ${a.repoOwner ?? "unknown"}/${a.repoName ?? "unknown"}`,
        `URL: ${a.url ?? "none"}`,
        `Reason flagged: ${a.reason}`,
        ``,
        `If this is unexpected, suspend the service immediately in the Render dashboard and investigate its logs and environment variables.`,
        `If this is legitimate, mark it as known in the AICostCentral dashboard.`,
      ].join("\n"),
      investigateSteps: [
        `Go to https://dashboard.render.com and find service "${a.name}"`,
        `Click Suspend Service immediately if you don't recognize it`,
        `Review Logs tab for outbound connections and request patterns`,
        `Check Environment tab for any API keys set on the service`,
        `Check repo https://github.com/${a.repoOwner}/${a.repoName} for malicious code`,
        `If attacker-deployed: file a report with Render support and rotate any exposed keys`,
      ],
      value: 0,
      baseline: 0,
      changePct: 0,
      detectedAt: today,
    }));

    await sendAlertNotifications(alerts);

    return NextResponse.json({
      anomalies: anomalies.length,
      services: anomalies.map((a) => ({ name: a.name, reason: a.reason })),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/render-inventory]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
