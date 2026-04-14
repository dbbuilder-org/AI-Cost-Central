/**
 * Send Expo push notifications to all registered devices.
 * Reads tokens from Vercel KV `push:tokens` set.
 * Uses the Expo Push API (no native SDK needed server-side).
 */

import type { Alert } from "@/types/alerts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  priority?: "default" | "normal" | "high";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
}

function buildPushMessage(token: string, alerts: Alert[]): ExpoPushMessage {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  let title = "AI Cost Central";
  let body: string;

  if (critical.length > 0) {
    title = `🚨 ${critical.length} Critical Alert${critical.length > 1 ? "s" : ""}`;
    body = critical[0].message;
  } else if (warnings.length > 0) {
    title = `⚠️ ${warnings.length} Warning${warnings.length > 1 ? "s" : ""}`;
    body = warnings[0].message;
  } else {
    title = `ℹ️ ${alerts.length} Info Alert${alerts.length > 1 ? "s" : ""}`;
    body = alerts[0].message;
  }

  if (alerts.length > 1) {
    body += ` (+${alerts.length - 1} more)`;
  }

  return {
    to: token,
    title,
    body,
    sound: "default",
    priority: critical.length > 0 ? "high" : "normal",
    data: { screen: "alerts", count: alerts.length },
  };
}

async function getStoredTokens(): Promise<string[]> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const members = await kv.smembers("push:tokens");
    return (members ?? []).filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}

export async function sendPushNotifications(
  alerts: Alert[]
): Promise<{ sent: number; failed: number }> {
  if (alerts.length === 0) return { sent: 0, failed: 0 };

  const tokens = await getStoredTokens();
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  // Batch into chunks of 100 (Expo limit)
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    const messages: ExpoPushMessage[] = chunk.map((token) =>
      buildPushMessage(token, alerts)
    );

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        failed += chunk.length;
        console.error("[push] Expo API error", res.status, await res.text());
        continue;
      }

      const result = await res.json() as { data: ExpoPushTicket[] };
      for (const ticket of result.data) {
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          console.warn("[push] ticket error:", ticket.message);
        }
      }
    } catch (err) {
      failed += chunk.length;
      console.error("[push] fetch error:", err);
    }
  }

  return { sent, failed };
}
