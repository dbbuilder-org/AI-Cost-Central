/**
 * Shared Resend email helper.
 * Accepts a single address or an array.
 * Returns { sent, error } — never throws.
 */

import { Resend } from "resend";

export interface SendResult {
  sent: boolean;
  error?: string;
  recipientCount?: number;
}

export async function sendEmail({
  to,
  subject,
  html,
  from = "noreply@servicevision.net",
}: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) {
    return { sent: false, error: "No recipients specified" };
  }

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from, to: recipients, subject, html });
    return { sent: true, recipientCount: recipients.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[email] Send failed:", msg);
    return { sent: false, error: msg };
  }
}
