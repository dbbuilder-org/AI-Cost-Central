/**
 * Expo Push API sender.
 * Sends push notifications to registered iOS/Android devices via the
 * Expo push service (no native APNS/FCM setup required).
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo max per request

export interface PushMessage {
  to: string;           // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
}

export interface PushTicket {
  id?: string;
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Send push notifications to a list of Expo push tokens.
 * Silently skips empty token lists, logs errors but never throws.
 */
export async function sendPushNotifications(
  messages: PushMessage[]
): Promise<PushTicket[]> {
  if (messages.length === 0) return [];

  const tickets: PushTicket[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.warn("[push] Expo API returned", res.status);
        tickets.push(...chunk.map(() => ({ status: "error" as const, message: `HTTP ${res.status}` })));
        continue;
      }

      const body = await res.json() as { data: PushTicket[] };
      tickets.push(...(body.data ?? []));
    } catch (err) {
      console.error("[push] send failed:", err);
      tickets.push(...chunk.map(() => ({ status: "error" as const, message: String(err) })));
    }
  }

  return tickets;
}

/** Build a push message for a single alert */
export function buildAlertPushMessage(
  token: string,
  alert: { severity: string; subject: string; message: string; type: string; id: string }
): PushMessage {
  const severityEmoji = alert.severity === "critical" ? "🚨" : alert.severity === "warning" ? "⚠️" : "ℹ️";
  return {
    to: token,
    title: `${severityEmoji} ${alert.subject}`,
    body: alert.message,
    sound: "default",
    priority: alert.severity === "critical" ? "high" : "normal",
    data: { alertId: alert.id, alertType: alert.type, severity: alert.severity },
  };
}
