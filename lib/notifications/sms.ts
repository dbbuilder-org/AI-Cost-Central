/**
 * Twilio SMS sender.
 * Sends SMS anomaly alerts to phone numbers registered in device_tokens.
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID   — AC... from Twilio console
 *   TWILIO_AUTH_TOKEN    — auth token from Twilio console
 *   TWILIO_PHONE_NUMBER  — E.164 sending number (e.g. +12065944357)
 */

function getTwilioConfig(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

/**
 * Send a single SMS via Twilio.
 * Returns true on success, false on failure (never throws).
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const config = getTwilioConfig();
  if (!config) {
    console.warn("[sms] Twilio env vars not configured — skipping SMS");
    return false;
  }

  const { accountSid, authToken, fromNumber } = config;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const params = new URLSearchParams({ From: fromNumber, To: to, Body: body });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: number };
      console.warn("[sms] Twilio error", res.status, err.message ?? err.code);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[sms] send failed:", err);
    return false;
  }
}

/** Build an SMS body for an alert (160 chars max for single segment) */
export function buildAlertSmsBody(alert: {
  severity: string;
  subject: string;
  message: string;
  type: string;
}): string {
  const prefix = alert.severity === "critical" ? "[CRITICAL]" : alert.severity === "warning" ? "[WARNING]" : "[INFO]";
  const text = `AICostCentral ${prefix} ${alert.subject}: ${alert.message}`;
  return text.length > 160 ? text.slice(0, 157) + "..." : text;
}
