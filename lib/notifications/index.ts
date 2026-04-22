/**
 * Unified notification dispatcher.
 * Sends push notifications (Expo) and SMS (Twilio) for new anomaly alerts
 * to all registered device tokens that match the severity preference.
 *
 * Called by:
 *   - /api/cron/anomaly-check (hourly) for newly detected alerts
 */

import { db, schema } from "@/lib/db";
import type { Alert } from "@/types/alerts";
import { sendPushNotifications, buildAlertPushMessage } from "./push";
import { sendSms, buildAlertSmsBody } from "./sms";

export type { PushMessage, PushTicket } from "./push";

/**
 * Send push + SMS notifications for a list of alerts to all registered devices.
 * Filters by each device's severity preferences.
 * Never throws — all errors are logged and swallowed.
 */
export async function sendAlertNotifications(alerts: Alert[]): Promise<void> {
  if (alerts.length === 0) return;

  let tokens: typeof schema.deviceTokens.$inferSelect[];
  try {
    tokens = await db.select().from(schema.deviceTokens);
  } catch (err) {
    console.error("[notifications] Failed to load device tokens:", err);
    return;
  }

  if (tokens.length === 0) return;

  // Build push messages — one per (device, alert) that passes severity filter
  const pushMessages = [];
  const smsBatches: Array<{ phone: string; body: string }> = [];

  for (const device of tokens) {
    for (const alert of alerts) {
      const wantsThis =
        (alert.severity === "critical" && device.notifyOnCritical) ||
        (alert.severity === "warning" && device.notifyOnWarning) ||
        (alert.severity === "info" && device.notifyOnInfo);

      if (!wantsThis) continue;

      // Push notification
      if (device.token) {
        pushMessages.push(buildAlertPushMessage(device.token, alert));
      }

      // SMS (deduplicated per phone — send one SMS listing all matching alerts per number)
    }

    // Batch SMS per phone: one message listing all matching alerts for this device
    if (device.phone) {
      const matchingAlerts = alerts.filter((a) =>
        (a.severity === "critical" && device.notifyOnCritical) ||
        (a.severity === "warning" && device.notifyOnWarning) ||
        (a.severity === "info" && device.notifyOnInfo)
      );

      if (matchingAlerts.length > 0) {
        if (matchingAlerts.length === 1) {
          smsBatches.push({
            phone: device.phone,
            body: buildAlertSmsBody(matchingAlerts[0]),
          });
        } else {
          // Multiple alerts: combine into one SMS
          const prefix = matchingAlerts.some((a) => a.severity === "critical")
            ? "[CRITICAL]"
            : "[WARNING]";
          const names = matchingAlerts.map((a) => a.subject).join(", ");
          const body = `AICostCentral ${prefix} ${matchingAlerts.length} new alerts: ${names}`;
          smsBatches.push({
            phone: device.phone,
            body: body.length > 160 ? body.slice(0, 157) + "..." : body,
          });
        }
      }
    }
  }

  // Fire push and SMS in parallel — don't await individually to keep it fast
  const tasks: Promise<unknown>[] = [];

  if (pushMessages.length > 0) {
    tasks.push(
      sendPushNotifications(pushMessages).catch((err) =>
        console.error("[notifications] Push batch failed:", err)
      )
    );
  }

  for (const { phone, body } of smsBatches) {
    tasks.push(
      sendSms(phone, body).catch((err) =>
        console.error("[notifications] SMS failed:", err)
      )
    );
  }

  await Promise.allSettled(tasks);
}
