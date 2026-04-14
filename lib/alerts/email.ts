/**
 * Alert email delivery via Resend.
 * Uses RESEND_API_KEY and ALERT_EMAIL_TO env vars.
 */

import type { Alert } from "@/types/alerts";
import { sendEmail } from "@/lib/email";
import { loadBriefConfig } from "@/lib/briefs/config";

const SEVERITY_COLOR = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info:     "#6366f1",
} as const;

const SEVERITY_BG = {
  critical: "#450a0a",
  warning:  "#451a03",
  info:     "#1e1b4b",
} as const;

const PROVIDER_BADGE = {
  openai:    { label: "OAI", color: "#818cf8" },
  anthropic: { label: "ANT", color: "#fb923c" },
  google:    { label: "GGL", color: "#34d399" },
} as const;

function providerBadge(provider: string): string {
  const p = PROVIDER_BADGE[provider as keyof typeof PROVIDER_BADGE];
  if (!p) return `<span style="color:#9ca3af">${provider}</span>`;
  return `<span style="background:${p.color}22;color:${p.color};padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600">${p.label}</span>`;
}

function severityBadge(severity: Alert["severity"]): string {
  const color = SEVERITY_COLOR[severity];
  const bg = SEVERITY_BG[severity];
  return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase">${severity}</span>`;
}

function formatChangePct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

export function renderAlertEmail(alerts: Alert[], dashboardUrl = "https://ai-cost-central.vercel.app"): string {
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;
  const info = alerts.filter((a) => a.severity === "info").length;

  const alertRows = alerts
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    })
    .map((alert) => `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:12px 8px;vertical-align:top">${severityBadge(alert.severity)}</td>
        <td style="padding:12px 8px;vertical-align:top">
          ${providerBadge(alert.provider)}
          <span style="color:#6b7280;font-size:11px;margin-left:4px">${alert.type.replace("_", " ")}</span>
        </td>
        <td style="padding:12px 8px;vertical-align:top;color:#e5e7eb;font-weight:600">${alert.subject}</td>
        <td style="padding:12px 8px;vertical-align:top;color:#9ca3af;font-size:12px">${alert.message}</td>
        <td style="padding:12px 8px;vertical-align:top;text-align:right;color:${alert.changePct > 0 ? "#ef4444" : "#10b981"};font-weight:600">${formatChangePct(alert.changePct)}</td>
      </tr>
      <tr style="border-bottom:1px solid #374151;background:#0f172a">
        <td colspan="5" style="padding:8px 8px 12px">
          <div style="color:#9ca3af;font-size:12px;margin-bottom:6px">${alert.detail}</div>
          <ol style="margin:0;padding-left:16px;color:#6b7280;font-size:11px">
            ${alert.investigateSteps.map((s) => `<li style="margin-bottom:2px">${s}</li>`).join("")}
          </ol>
        </td>
      </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AICostCentral Alert Digest</title></head>
<body style="margin:0;padding:0;background:#030712;font-family:system-ui,-apple-system,sans-serif;color:#f9fafb">
  <div style="max-width:700px;margin:0 auto;padding:24px">

    <!-- Header -->
    <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:20px 24px;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <span style="font-size:18px;font-weight:700;color:#fff">AICostCentral</span>
          <span style="margin-left:8px;background:#312e81;color:#a5b4fc;font-size:11px;padding:2px 7px;border-radius:4px">Alert Digest</span>
        </div>
        <span style="color:#6b7280;font-size:12px">${date}</span>
      </div>
    </div>

    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#ef4444">${critical}</div>
        <div style="font-size:11px;color:#fca5a5;margin-top:2px">Critical</div>
      </div>
      <div style="background:#451a03;border:1px solid #78350f;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#f59e0b">${warning}</div>
        <div style="font-size:11px;color:#fcd34d;margin-top:2px">Warnings</div>
      </div>
      <div style="background:#1e1b4b;border:1px solid #3730a3;border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#818cf8">${info}</div>
        <div style="font-size:11px;color:#c7d2fe;margin-top:2px">Info</div>
      </div>
    </div>

    <!-- Alert table -->
    <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #1f2937">
        <span style="font-size:13px;font-weight:600;color:#e5e7eb">Detected Anomalies</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid #374151;background:#0f172a">
            <th style="padding:8px;text-align:left;color:#6b7280;font-size:11px;font-weight:500">Severity</th>
            <th style="padding:8px;text-align:left;color:#6b7280;font-size:11px;font-weight:500">Provider / Type</th>
            <th style="padding:8px;text-align:left;color:#6b7280;font-size:11px;font-weight:500">Subject</th>
            <th style="padding:8px;text-align:left;color:#6b7280;font-size:11px;font-weight:500">Summary</th>
            <th style="padding:8px;text-align:right;color:#6b7280;font-size:11px;font-weight:500">Change</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:20px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600">
        Open Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;color:#374151;font-size:11px">
      AICostCentral · <a href="${dashboardUrl}/settings" style="color:#4f46e5;text-decoration:none">Manage alert settings</a>
    </div>
  </div>
</body>
</html>`;
}

export async function sendAlertEmail(alerts: Alert[]): Promise<{ sent: boolean; error?: string }> {
  const { recipients, from, dashboardUrl } = loadBriefConfig();

  if (recipients.length === 0) {
    console.warn("[alerts/email] No recipients configured — skipping email");
    return { sent: false, error: "No recipients configured" };
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const subject = criticalCount > 0
    ? `🚨 [AICostCentral] ${criticalCount} critical alert${criticalCount > 1 ? "s" : ""} detected`
    : `⚠️ [AICostCentral] ${alerts.length} usage anomal${alerts.length > 1 ? "ies" : "y"} detected`;

  return sendEmail({ to: recipients, from, subject, html: renderAlertEmail(alerts, dashboardUrl) });
}
