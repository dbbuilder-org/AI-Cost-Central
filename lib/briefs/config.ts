/**
 * Brief configuration loaded from environment variables.
 *
 * Environment variables:
 *  BRIEF_RECIPIENTS      Comma-separated list of recipient emails.
 *                        Falls back to ALERT_EMAIL_TO if not set.
 *  BRIEF_FROM            Sender address (default: noreply@servicevision.net)
 *  BRIEF_DAILY_ENABLED   "true" to send daily brief (default: false)
 *  BRIEF_WEEKLY_ENABLED  "true" to send weekly brief (default: false)
 *  BRIEF_ANOMALY_ENABLED "true" to send anomaly alert digest (default: true)
 *  DASHBOARD_URL         Base URL for "Open Dashboard" links
 */

export interface BriefConfig {
  recipients: string[];
  from: string;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  anomalyEnabled: boolean;
  dashboardUrl: string;
}

export function loadBriefConfig(): BriefConfig {
  const recipientRaw =
    process.env.BRIEF_RECIPIENTS ?? process.env.ALERT_EMAIL_TO ?? "";

  const recipients = recipientRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    recipients,
    from: process.env.BRIEF_FROM ?? "noreply@servicevision.net",
    dailyEnabled: process.env.BRIEF_DAILY_ENABLED === "true",
    weeklyEnabled: process.env.BRIEF_WEEKLY_ENABLED === "true",
    anomalyEnabled: process.env.BRIEF_ANOMALY_ENABLED !== "false", // on by default
    dashboardUrl: (
      process.env.DASHBOARD_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://aicostcentral.vercel.app")
    ),
  };
}
