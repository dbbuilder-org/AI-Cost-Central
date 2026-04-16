/**
 * Slack alert delivery for AICostCentral.
 *
 * Sends an anomaly digest to a Slack incoming webhook URL using Block Kit.
 * Configure via SLACK_ALERT_WEBHOOK_URL environment variable.
 *
 * Each severity maps to a distinctive emoji and color attachment.
 */

import type { Alert } from "@/types/alerts";

const SEVERITY_EMOJI: Record<Alert["severity"], string> = {
  critical: "🚨",
  warning:  "⚠️",
  info:     "ℹ️",
};

const SEVERITY_COLOR: Record<Alert["severity"], string> = {
  critical: "#ef4444",
  warning:  "#f59e0b",
  info:     "#6366f1",
};

const PROVIDER_EMOJI: Record<string, string> = {
  openai:    "🟦",
  anthropic: "🟧",
  google:    "🟩",
  groq:      "🟪",
  mistral:   "⬛",
  cohere:    "🟫",
};

function providerEmoji(provider: string): string {
  return PROVIDER_EMOJI[provider] ?? "◻️";
}

function formatChangePct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

/** Build a Slack Block Kit payload for a list of alerts */
export function buildSlackPayload(
  alerts: Alert[],
  dashboardUrl = "https://aicostcentral.vercel.app",
): object {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning  = alerts.filter((a) => a.severity === "warning").length;
  const info     = alerts.filter((a) => a.severity === "info").length;

  const title = critical > 0
    ? `🚨 *${critical} critical alert${critical > 1 ? "s" : ""}* detected by AICostCentral`
    : `⚠️ *${alerts.length} usage anomal${alerts.length > 1 ? "ies" : "y"}* detected by AICostCentral`;

  // Sort by severity
  const sorted = [...alerts].sort((a, b) => {
    const order: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  // Summary block
  const blocks: object[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: title },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `🔴 *${critical}* critical  |  🟡 *${warning}* warning  |  🔵 *${info}* info` },
      ],
    },
    { type: "divider" },
  ];

  // One attachment per alert (color-coded sidebar)
  const attachments: object[] = sorted.map((alert) => ({
    color: SEVERITY_COLOR[alert.severity],
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `${SEVERITY_EMOJI[alert.severity]} *${alert.subject}*  ${providerEmoji(alert.provider)} \`${alert.provider}\``,
            `*${alert.message}*  _(${formatChangePct(alert.changePct)})_`,
            alert.detail,
          ].join("\n"),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Next steps:* ${alert.investigateSteps.slice(0, 2).join(" · ")}`,
          },
        ],
      },
    ],
  }));

  // CTA footer
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open Dashboard →", emoji: true },
        url: dashboardUrl,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Alert Settings", emoji: true },
        url: `${dashboardUrl}/settings`,
      },
    ],
  });

  return { blocks, attachments };
}

/** Send alert digest to Slack. Returns { sent, error }. */
export async function sendSlackAlerts(
  alerts: Alert[],
): Promise<{ sent: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return { sent: false, error: "SLACK_ALERT_WEBHOOK_URL not configured" };
  }

  const dashboardUrl =
    process.env.DASHBOARD_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aicostcentral.vercel.app");

  const payload = buildSlackPayload(alerts, dashboardUrl);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Slack returned ${res.status}: ${body}` };
    }

    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Slack delivery failed";
    return { sent: false, error: msg };
  }
}

/**
 * Send a single budget-exceeded message to Slack.
 * Used by the SmartRouter budget enforcement path.
 */
export async function sendSlackBudgetAlert(opts: {
  projectId: string;
  budgetType: "daily" | "monthly";
  limitUsd: number;
  spentUsd: number;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const dashboardUrl =
    process.env.DASHBOARD_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aicostcentral.vercel.app");

  const pct = ((opts.spentUsd / opts.limitUsd) * 100).toFixed(0);

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `🚨 *Budget exceeded* — project \`${opts.projectId}\``,
            `${opts.budgetType === "daily" ? "Daily" : "Monthly"} limit of *$${opts.limitUsd.toFixed(2)}* reached`,
            `Spent: *$${opts.spentUsd.toFixed(4)}* (${pct}% of limit)`,
          ].join("\n"),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Budget Settings →" },
            url: `${dashboardUrl}/settings/routing`,
            style: "danger",
          },
        ],
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Fire-and-forget — budget enforcement already handled
  }
}
