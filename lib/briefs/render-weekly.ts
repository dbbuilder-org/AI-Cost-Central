/**
 * Renders the weekly brief email.
 * Includes: WoW spend comparison, day-by-day table, top models,
 * provider breakdown, new models/keys, and top API keys.
 */

import type { WeeklyBriefData } from "./data";
import {
  providerBadge,
  changePill,
  sectionHeader,
  card,
  metricCard,
  htmlShell,
  emailHeader,
  PROVIDER_BADGE,
} from "./html";

const PROVIDER_COLOR: Record<string, string> = {
  openai: "#818cf8",
  anthropic: "#fb923c",
  google: "#34d399",
};

function dayTable(byDay: WeeklyBriefData["thisWeek"]["byDay"], avgPerDay: number): string {
  const max = Math.max(...byDay.map((d) => d.costUSD), 0.01);

  const rows = byDay
    .map((d) => {
      const pct = (d.costUSD / max) * 100;
      const diff = d.costUSD - avgPerDay;
      const diffColor = diff > 0 ? "#ef4444" : "#10b981";
      const dayLabel = new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
      });
      return `<tr style="border-bottom:1px solid #1f2937">
        <td style="padding:8px 12px;color:#9ca3af;font-size:12px;white-space:nowrap">${dayLabel}</td>
        <td style="padding:8px 12px;color:#fff;font-weight:600">$${d.costUSD.toFixed(2)}</td>
        <td style="padding:8px 12px;width:180px">
          <div style="background:#1f2937;border-radius:3px;height:8px">
            <div style="background:#6366f1;border-radius:3px;height:8px;width:${Math.round(pct)}%"></div>
          </div>
        </td>
        <td style="padding:8px 12px;text-align:right;font-size:12px;color:${diffColor}">
          ${diff >= 0 ? "+" : ""}$${diff.toFixed(2)} vs avg
        </td>
      </tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#0f172a">
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:10px;font-weight:500">Day</th>
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:10px;font-weight:500">Cost</th>
        <th style="padding:8px 12px;color:#6b7280;font-size:10px;font-weight:500"></th>
        <th style="padding:8px 12px;text-align:right;color:#6b7280;font-size:10px;font-weight:500">vs avg</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function providerRows(byProvider: WeeklyBriefData["thisWeek"]["byProvider"]): string {
  return byProvider
    .map((p) => {
      const color = PROVIDER_COLOR[p.provider] ?? "#9ca3af";
      return `<tr style="border-bottom:1px solid #1f2937">
        <td style="padding:8px 12px">${providerBadge(p.provider)}</td>
        <td style="padding:8px 12px;color:#e5e7eb;font-weight:600">$${p.costUSD.toFixed(2)}</td>
        <td style="padding:8px 12px;color:#6b7280;font-size:12px">${p.requests.toLocaleString()} reqs</td>
        <td style="padding:8px 12px;width:130px">
          <div style="background:#1f2937;border-radius:3px;height:6px">
            <div style="background:${color};border-radius:3px;height:6px;width:${Math.round(p.pctOfTotal)}%"></div>
          </div>
          <span style="font-size:10px;color:#6b7280">${p.pctOfTotal.toFixed(0)}%</span>
        </td>
      </tr>`;
    })
    .join("");
}

function modelRows(topModels: WeeklyBriefData["thisWeek"]["topModels"]): string {
  const maxCost = Math.max(...topModels.map((m) => m.costUSD), 0.01);
  return topModels
    .map((m, i) => {
      const pct = (m.costUSD / maxCost) * 100;
      return `<tr style="border-bottom:1px solid #1f2937">
        <td style="padding:8px 12px;color:#6b7280;font-size:12px">${i + 1}</td>
        <td style="padding:8px 12px">
          ${providerBadge(m.provider)}
          <span style="color:#e5e7eb;margin-left:6px;font-size:13px">${m.model}</span>
        </td>
        <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right">$${m.costUSD.toFixed(2)}</td>
        <td style="padding:8px 12px;color:#6b7280;font-size:12px;text-align:right">${m.requests.toLocaleString()}</td>
        <td style="padding:8px 12px;width:100px">
          <div style="background:#1f2937;border-radius:3px;height:5px">
            <div style="background:#6366f1;border-radius:3px;height:5px;width:${Math.round(pct)}%"></div>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function keyRows(topKeys: WeeklyBriefData["thisWeek"]["topKeys"]): string {
  return topKeys
    .map((k) => `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:8px 12px">
          ${providerBadge(k.provider)}
          <span style="color:#e5e7eb;margin-left:6px;font-size:13px">${k.apiKeyName}</span>
        </td>
        <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right">$${k.costUSD.toFixed(2)}</td>
        <td style="padding:8px 12px;color:#6b7280;font-size:12px;text-align:right">${k.requests.toLocaleString()}</td>
      </tr>`)
    .join("");
}

function newItemsList(
  newModels: string[],
  newKeys: WeeklyBriefData["newKeys"]
): string {
  if (newModels.length === 0 && newKeys.length === 0) {
    return `<div style="padding:12px 16px;color:#6b7280;font-size:13px">No new models or keys this week</div>`;
  }
  let html = "";
  if (newModels.length > 0) {
    html += `<div style="padding:10px 16px;border-bottom:1px solid #1f2937">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">New Models</div>
      ${newModels.map((m) => `<span style="background:#312e81;color:#a5b4fc;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:5px;margin-bottom:4px;display:inline-block">${m}</span>`).join("")}
    </div>`;
  }
  if (newKeys.length > 0) {
    html += `<div style="padding:10px 16px">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">New API Keys</div>
      ${newKeys.map((k) => `<div style="margin-bottom:4px">
        ${providerBadge(k.provider)}
        <span style="color:#e5e7eb;font-size:13px;margin-left:6px">${k.name}</span>
        <span style="color:#6b7280;font-size:11px;margin-left:6px">$${k.costUSD.toFixed(2)} this week</span>
      </div>`).join("")}
    </div>`;
  }
  return html;
}

export function renderWeeklyEmail(data: WeeklyBriefData, dashboardUrl: string): string {
  const { thisWeek, priorWeek, weekLabel } = data;
  const avgPerDay = thisWeek.totalCostUSD / Math.max(thisWeek.byDay.length, 1);

  const body = `
    ${emailHeader("Weekly Brief", `Spend summary for week of ${weekLabel}`)}

    <!-- Headline metrics -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      ${metricCard("This Week", `$${thisWeek.totalCostUSD.toFixed(2)}`, priorWeek.totalCostUSD > 0 ? `${priorWeek.changePct > 0 ? "+" : ""}${priorWeek.changePct.toFixed(1)}% vs last week` : "No prior week data")}
      ${metricCard("Last Week", `$${priorWeek.totalCostUSD.toFixed(2)}`, "comparison")}
      ${metricCard("Avg / Day", `$${avgPerDay.toFixed(2)}`, "this week")}
      ${metricCard("Requests", thisWeek.totalRequests.toLocaleString(), "this week")}
    </div>

    <!-- WoW change callout -->
    ${priorWeek.totalCostUSD > 0 ? `
    <div style="background:${priorWeek.changePct > 10 ? "#450a0a" : priorWeek.changePct < -10 ? "#052e16" : "#111827"};border:1px solid ${priorWeek.changePct > 10 ? "#7f1d1d" : priorWeek.changePct < -10 ? "#14532d" : "#1f2937"};border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:20px">${priorWeek.changePct > 10 ? "⚠️" : priorWeek.changePct < -10 ? "✅" : "📊"}</span>
      <div>
        <div style="color:#e5e7eb;font-size:14px;font-weight:600">
          Week-over-week: ${priorWeek.changePct > 0 ? "+" : ""}${priorWeek.changePct.toFixed(1)}%
          ${changePill(priorWeek.changePct)}
        </div>
        <div style="color:#9ca3af;font-size:12px;margin-top:2px">
          $${thisWeek.totalCostUSD.toFixed(2)} this week vs $${priorWeek.totalCostUSD.toFixed(2)} last week
        </div>
      </div>
    </div>` : ""}

    <!-- Day by day -->
    ${thisWeek.byDay.length > 0 ? card(`
      ${sectionHeader("Daily Breakdown")}
      ${dayTable(thisWeek.byDay, avgPerDay)}
    `) : ""}

    <!-- Provider breakdown -->
    ${thisWeek.byProvider.length > 0 ? card(`
      ${sectionHeader("By Provider")}
      <table style="width:100%;border-collapse:collapse">
        <tbody>${providerRows(thisWeek.byProvider)}</tbody>
      </table>
    `) : ""}

    <!-- Top models -->
    ${thisWeek.topModels.length > 0 ? card(`
      ${sectionHeader("Top Models")}
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#0f172a">
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:10px;font-weight:500">#</th>
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:10px;font-weight:500">Model</th>
            <th style="padding:8px 12px;text-align:right;color:#6b7280;font-size:10px;font-weight:500">Cost</th>
            <th style="padding:8px 12px;text-align:right;color:#6b7280;font-size:10px;font-weight:500">Requests</th>
            <th style="padding:8px 12px;color:#6b7280;font-size:10px;font-weight:500"></th>
          </tr>
        </thead>
        <tbody>${modelRows(thisWeek.topModels)}</tbody>
      </table>
    `) : ""}

    <!-- Top keys -->
    ${thisWeek.topKeys.length > 0 ? card(`
      ${sectionHeader("Top API Keys")}
      <table style="width:100%;border-collapse:collapse">
        <tbody>${keyRows(thisWeek.topKeys)}</tbody>
      </table>
    `) : ""}

    <!-- New models & keys -->
    ${card(`
      ${sectionHeader("New This Week")}
      ${newItemsList(data.newModels, data.newKeys)}
    `)}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:16px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600">
        Open Full Dashboard →
      </a>
    </div>
  `;

  return htmlShell("AICostCentral Weekly Brief", body, dashboardUrl);
}

export async function sendWeeklyBrief(
  data: WeeklyBriefData,
  config: import("./config").BriefConfig
): Promise<{ sent: boolean; error?: string }> {
  const { sendEmail } = await import("@/lib/email");
  const { recipients, from, dashboardUrl } = config;

  if (recipients.length === 0) {
    return { sent: false, error: "No recipients configured" };
  }

  const { changePct, totalCostUSD: priorCost } = data.priorWeek;
  const changeStr =
    priorCost > 0
      ? ` (${changePct > 0 ? "▲" : "▼"}${Math.abs(changePct).toFixed(0)}% WoW)`
      : "";

  const subject = `📅 [AICostCentral] Weekly Brief — ${data.weekLabel} — $${data.thisWeek.totalCostUSD.toFixed(2)}${changeStr}`;

  return sendEmail({
    to: recipients,
    from,
    subject,
    html: renderWeeklyEmail(data, dashboardUrl),
  });
}
