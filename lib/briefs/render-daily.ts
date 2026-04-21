/**
 * Renders the daily brief email.
 * Includes: yesterday's spend, provider breakdown, top models,
 * top keys, 7-day trend bar chart, and any anomaly alerts.
 */

import type { DailyBriefData } from "./data";
import type { Alert } from "@/types/alerts";
import {
  providerBadge,
  changePill,
  sectionHeader,
  card,
  metricCard,
  miniBar,
  htmlShell,
  emailHeader,
  PROVIDER_BADGE,
} from "./html";

const PROVIDER_COLOR: Record<string, string> = {
  openai: "#818cf8",
  anthropic: "#fb923c",
  google: "#34d399",
};

function trendBars(byDay: DailyBriefData["trailing7d"]["byDay"]): string {
  if (byDay.length === 0) return "";
  const max = Math.max(...byDay.map((d) => d.costUSD), 0.01);
  const fmtDate = (s: string) => {
    const d = new Date(s + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  };

  const bars = byDay
    .map((d, i) => {
      const isToday = i === byDay.length - 1;
      const pct = (d.costUSD / max) * 100;
      const color = isToday ? "#6366f1" : "#374151";
      const textColor = isToday ? "#a5b4fc" : "#6b7280";
      return `<td style="text-align:center;padding:0 2px;vertical-align:bottom">
        <div style="background:${color};width:22px;height:${Math.max(3, Math.round(pct * 0.5))}px;border-radius:2px 2px 0 0;margin:0 auto"></div>
        <div style="font-size:8px;color:${textColor};margin-top:2px;white-space:nowrap">${fmtDate(d.date)}</div>
        <div style="font-size:9px;color:${textColor};white-space:nowrap">$${d.costUSD.toFixed(2)}</div>
      </td>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse"><tr>${bars}</tr></table>`;
}

function providerRows(byProvider: DailyBriefData["yesterday"]["byProvider"]): string {
  return byProvider
    .map((p) => {
      const color = PROVIDER_COLOR[p.provider] ?? "#9ca3af";
      return `<tr style="border-bottom:1px solid #1f2937">
        <td style="padding:6px 10px">${providerBadge(p.provider)}</td>
        <td style="padding:6px 10px;color:#e5e7eb;font-weight:600;font-size:12px;white-space:nowrap">$${p.costUSD.toFixed(4)}</td>
        <td style="padding:6px 10px;color:#6b7280;font-size:11px;white-space:nowrap">${p.requests.toLocaleString()} reqs</td>
        <td style="padding:6px 10px;color:#9ca3af;font-size:10px;width:90px">
          <div style="background:#1f2937;border-radius:3px;height:4px">
            <div style="background:${color};border-radius:3px;height:4px;width:${Math.round(p.pctOfTotal)}%"></div>
          </div>
          <span style="font-size:9px">${p.pctOfTotal.toFixed(0)}%</span>
        </td>
      </tr>`;
    })
    .join("");
}

function modelRows(topModels: DailyBriefData["yesterday"]["topModels"]): string {
  return topModels
    .map((m, i) => `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:5px 6px;color:#6b7280;font-size:10px;text-align:center">${i + 1}</td>
        <td style="padding:5px 8px;max-width:180px">
          ${providerBadge(m.provider)}
          <span style="color:#e5e7eb;margin-left:4px;font-size:11px;word-break:break-word">${m.model}</span>
        </td>
        <td style="padding:5px 8px;color:#fff;font-weight:600;font-size:11px;text-align:right;white-space:nowrap">$${m.costUSD.toFixed(4)}</td>
        <td style="padding:5px 8px;color:#6b7280;font-size:10px;text-align:right;white-space:nowrap">${m.requests.toLocaleString()}</td>
        <td style="padding:5px 8px;color:#9ca3af;font-size:10px;text-align:right;white-space:nowrap">$${m.costPerRequest.toFixed(5)}</td>
      </tr>`)
    .join("");
}

function keyRows(topKeys: DailyBriefData["yesterday"]["topKeys"]): string {
  return topKeys
    .map((k) => `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:5px 8px">
          ${providerBadge(k.provider)}
          <span style="color:#e5e7eb;margin-left:4px;font-size:11px">${k.apiKeyName}</span>
        </td>
        <td style="padding:5px 8px;color:#fff;font-weight:600;font-size:11px;text-align:right;white-space:nowrap">$${k.costUSD.toFixed(4)}</td>
        <td style="padding:5px 8px;color:#6b7280;font-size:10px;text-align:right;white-space:nowrap">${k.requests.toLocaleString()} reqs</td>
      </tr>`)
    .join("");
}

function alertSummary(alerts: Alert[]): string {
  if (alerts.length === 0) {
    return `<div style="padding:14px 16px;color:#6b7280;font-size:13px">✅ No anomalies detected</div>`;
  }
  const sorted = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  const SCOLOR = { critical: "#ef4444", warning: "#f59e0b", info: "#818cf8" };
  const SBADGE = { critical: "#450a0a", warning: "#451a03", info: "#1e1b4b" };
  return sorted
    .map((a) => {
      const color = SCOLOR[a.severity];
      const bg = SBADGE[a.severity];
      return `<div style="padding:10px 16px;border-bottom:1px solid #1f2937;display:flex;align-items:flex-start;gap:10px">
        <span style="background:${bg};color:${color};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;flex-shrink:0;margin-top:1px">${a.severity.toUpperCase()}</span>
        <div>
          <div style="color:#e5e7eb;font-size:13px">${a.message}</div>
          ${a.detail ? `<div style="color:#9ca3af;font-size:11px;margin-top:2px">${a.detail}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

export function renderDailyEmail(
  data: DailyBriefData,
  alerts: Alert[],
  dashboardUrl: string
): string {
  const fmtDate = (s: string) =>
    new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });

  const changePct = data.priorDay.changePct;

  const body = `
    ${emailHeader("Daily Brief", `Spend summary for ${fmtDate(data.reportDate)}`)}

    <!-- Headline metrics -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      ${metricCard("Total Spend", `$${data.yesterday.totalCostUSD.toFixed(2)}`, changePct !== 0 ? `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% vs prior day` : "Same as prior day")}
      ${metricCard("Requests", data.yesterday.totalRequests.toLocaleString(), "yesterday")}
      ${metricCard("7d Average", `$${data.trailing7d.avgPerDay.toFixed(2)}`, "per day")}
      ${metricCard("7d Total", `$${data.trailing7d.totalCostUSD.toFixed(2)}`, "trailing 7 days")}
    </div>

    <!-- 7-day trend -->
    ${card(`
      ${sectionHeader("7-Day Spend Trend")}
      <div style="padding:16px">
        ${trendBars(data.trailing7d.byDay)}
      </div>
    `)}

    <!-- Provider breakdown -->
    ${data.yesterday.byProvider.length > 0 ? card(`
      ${sectionHeader("By Provider — Yesterday")}
      <table style="width:100%;border-collapse:collapse">
        <tbody>${providerRows(data.yesterday.byProvider)}</tbody>
      </table>
    `) : ""}

    <!-- Top models -->
    ${data.yesterday.topModels.length > 0 ? card(`
      ${sectionHeader("Top Models — Yesterday")}
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#0f172a">
            <th style="padding:5px 6px;text-align:center;color:#6b7280;font-size:9px;font-weight:500">#</th>
            <th style="padding:5px 8px;text-align:left;color:#6b7280;font-size:9px;font-weight:500">Model</th>
            <th style="padding:5px 8px;text-align:right;color:#6b7280;font-size:9px;font-weight:500;white-space:nowrap">Cost</th>
            <th style="padding:5px 8px;text-align:right;color:#6b7280;font-size:9px;font-weight:500;white-space:nowrap">Reqs</th>
            <th style="padding:5px 8px;text-align:right;color:#6b7280;font-size:9px;font-weight:500;white-space:nowrap">$/req</th>
          </tr>
        </thead>
        <tbody>${modelRows(data.yesterday.topModels)}</tbody>
      </table>
    `) : ""}

    <!-- Top keys -->
    ${data.yesterday.topKeys.length > 0 ? card(`
      ${sectionHeader("Top API Keys — Yesterday")}
      <table style="width:100%;border-collapse:collapse">
        <tbody>${keyRows(data.yesterday.topKeys)}</tbody>
      </table>
    `) : ""}

    <!-- Anomaly alerts -->
    ${card(`
      ${sectionHeader(`Anomaly Alerts (${alerts.length})`)}
      ${alertSummary(alerts)}
    `)}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:16px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600">
        Open Full Dashboard →
      </a>
    </div>
  `;

  return htmlShell("AICostCentral Daily Brief", body, dashboardUrl);
}

export async function sendDailyBrief(
  data: DailyBriefData,
  alerts: Alert[],
  config: import("./config").BriefConfig
): Promise<{ sent: boolean; error?: string }> {
  const { sendEmail } = await import("@/lib/email");
  const { recipients, from, dashboardUrl } = config;

  if (recipients.length === 0) {
    return { sent: false, error: "No recipients configured" };
  }

  const fmtShort = (s: string) =>
    new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "UTC",
    });

  const changeStr =
    data.priorDay.changePct > 0
      ? `▲${data.priorDay.changePct.toFixed(0)}%`
      : data.priorDay.changePct < 0
      ? `▼${Math.abs(data.priorDay.changePct).toFixed(0)}%`
      : "flat";

  const subject = `📊 [AICostCentral] Daily Brief — ${fmtShort(data.reportDate)} — $${data.yesterday.totalCostUSD.toFixed(2)} (${changeStr})`;

  return sendEmail({
    to: recipients,
    from,
    subject,
    html: renderDailyEmail(data, alerts, dashboardUrl),
  });
}
