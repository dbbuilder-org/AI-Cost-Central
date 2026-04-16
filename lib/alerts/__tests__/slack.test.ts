import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Alert } from "@/types/alerts";

// ── Globals ───────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "a1",
    type: "cost_spike",
    severity: "warning",
    provider: "openai",
    subject: "gpt-4o",
    message: "Daily cost 80% above baseline",
    value: 18,
    baseline: 10,
    changePct: 80,
    detail: "Usage spike detected on gpt-4o",
    investigateSteps: ["Check recent API calls", "Review rate limits"],
    detectedAt: "2026-04-16",
    ...overrides,
  };
}

// ── buildSlackPayload ─────────────────────────────────────────────────────────

describe("buildSlackPayload", () => {
  let buildSlackPayload: typeof import("@/lib/alerts/slack").buildSlackPayload;

  beforeEach(async () => {
    const mod = await import("@/lib/alerts/slack");
    buildSlackPayload = mod.buildSlackPayload;
  });

  it("returns blocks and attachments", () => {
    const payload = buildSlackPayload([makeAlert()]) as {
      blocks: unknown[];
      attachments: unknown[];
    };
    expect(payload.blocks).toBeDefined();
    expect(payload.attachments).toBeDefined();
    expect(Array.isArray(payload.blocks)).toBe(true);
    expect(Array.isArray(payload.attachments)).toBe(true);
    expect(payload.attachments).toHaveLength(1);
  });

  it("uses critical emoji and title for critical alerts", () => {
    const payload = buildSlackPayload([
      makeAlert({ severity: "critical" }),
    ]) as { blocks: Array<{ text?: { text: string } }> };

    const firstBlock = payload.blocks[0] as { text: { text: string } };
    expect(firstBlock.text.text).toContain("🚨");
    expect(firstBlock.text.text).toContain("critical");
  });

  it("uses warning emoji for non-critical alerts", () => {
    const payload = buildSlackPayload([makeAlert({ severity: "warning" })]) as {
      blocks: Array<{ text?: { text: string } }>;
    };
    const firstBlock = payload.blocks[0] as { text: { text: string } };
    expect(firstBlock.text.text).toContain("⚠️");
  });

  it("sorts critical alerts before warnings", () => {
    const alerts = [
      makeAlert({ id: "w1", severity: "warning", subject: "gpt-4o-mini" }),
      makeAlert({ id: "c1", severity: "critical", subject: "gpt-4o" }),
    ];
    const payload = buildSlackPayload(alerts) as {
      attachments: Array<{ color: string }>;
    };
    // First attachment should be critical (red)
    expect(payload.attachments[0].color).toBe("#ef4444");
    // Second should be warning (amber)
    expect(payload.attachments[1].color).toBe("#f59e0b");
  });

  it("includes dashboard URL in CTA button", () => {
    const url = "https://my-dashboard.example.com";
    const payload = buildSlackPayload([makeAlert()], url) as {
      blocks: Array<{ elements?: Array<{ url?: string }> }>;
    };
    const actionsBlock = payload.blocks.find((b) =>
      (b as { type: string }).type === "actions",
    ) as { elements: Array<{ url: string }> } | undefined;
    expect(actionsBlock?.elements[0].url).toBe(url);
  });
});

// ── sendSlackAlerts ───────────────────────────────────────────────────────────

describe("sendSlackAlerts", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SLACK_ALERT_WEBHOOK_URL;
    delete process.env.DASHBOARD_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns sent: false when webhook URL is not configured", async () => {
    const { sendSlackAlerts } = await import("@/lib/alerts/slack");
    const result = await sendSlackAlerts([makeAlert()]);
    expect(result.sent).toBe(false);
    expect(result.error).toContain("SLACK_ALERT_WEBHOOK_URL not configured");
  });

  it("sends POST to webhook URL and returns sent: true on 200", async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.com/test";

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const { sendSlackAlerts } = await import("@/lib/alerts/slack");
    const result = await sendSlackAlerts([makeAlert()]);

    expect(result.sent).toBe(true);
    expect(result.error).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns sent: false and error on non-200 response", async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.com/test";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "invalid_token",
    });

    const { sendSlackAlerts } = await import("@/lib/alerts/slack");
    const result = await sendSlackAlerts([makeAlert()]);

    expect(result.sent).toBe(false);
    expect(result.error).toContain("403");
  });

  it("returns sent: false and error on network failure", async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = "https://hooks.slack.com/test";

    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { sendSlackAlerts } = await import("@/lib/alerts/slack");
    const result = await sendSlackAlerts([makeAlert()]);

    expect(result.sent).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});
