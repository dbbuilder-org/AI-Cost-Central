/**
 * Webhook delivery for AICostCentral.
 *
 * Delivers event payloads to all active org webhooks subscribed to the given event.
 * Uses HMAC-SHA256 signing when a secret is configured.
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 * Updates last_delivered_at, last_status_code, and failure_count in DB.
 *
 * Supported events:
 *   alert.fired           — anomaly alert detected
 *   budget.exceeded       — project budget limit hit
 *   model.price_changed   — model pricing changed > threshold
 */
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import crypto from "crypto";

export type WebhookEvent =
  | "alert.fired"
  | "budget.exceeded"
  | "model.price_changed";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: unknown;
}

function sign(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

async function attemptDelivery(url: string, payload: string, secret: string | null): Promise<{ ok: boolean; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent":   "AICostCentral-Webhook/1.0",
  };
  if (secret) headers["X-AICC-Signature"] = sign(secret, payload);

  const res = await fetch(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(10_000) });
  return { ok: res.ok, status: res.status };
}

async function deliverWithRetry(
  url: string,
  payload: string,
  secret: string | null,
  maxRetries = 3,
): Promise<{ ok: boolean; status: number }> {
  let lastResult = { ok: false, status: 0 };
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    try {
      lastResult = await attemptDelivery(url, payload, secret);
      if (lastResult.ok) return lastResult;
    } catch {
      lastResult = { ok: false, status: 0 };
    }
  }
  return lastResult;
}

/**
 * Deliver an event to all org webhooks subscribed to it.
 * Pass orgId to scope to a single org; omit to broadcast across all orgs (for global events like price changes).
 */
export async function deliverWebhookEvent(
  event: WebhookEvent,
  data: unknown,
  orgId?: string,
): Promise<void> {
  // Fetch relevant webhooks
  let hooks;
  if (orgId) {
    hooks = await db.select().from(schema.orgWebhooks)
      .where(eq(schema.orgWebhooks.orgId, orgId));
  } else {
    hooks = await db.select().from(schema.orgWebhooks);
  }

  // Filter to active hooks subscribed to this event
  const relevant = hooks.filter(
    (h) => h.isActive && (h.events.length === 0 || h.events.includes(event))
  );
  if (relevant.length === 0) return;

  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data,
  } satisfies WebhookPayload);

  // Deliver in parallel (each hook independently)
  await Promise.all(relevant.map(async (hook) => {
    const result = await deliverWithRetry(hook.url, payload, hook.secret ?? null);

    await db.update(schema.orgWebhooks)
      .set({
        lastDeliveredAt: new Date(),
        lastStatusCode: result.status,
        failureCount: result.ok ? 0 : (hook.failureCount + 1),
        // Auto-disable after 10 consecutive failures
        isActive: result.ok ? true : (hook.failureCount + 1 < 10),
      })
      .where(eq(schema.orgWebhooks.id, hook.id));

    if (!result.ok) {
      console.warn(`[webhook] delivery failed for ${hook.url} — status ${result.status}`);
    }
  }));
}
