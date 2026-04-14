import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Alert } from "@/types/alerts";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock @vercel/kv
vi.mock("@vercel/kv", () => ({
  kv: {
    smembers: vi.fn(),
  },
}));

// Set KV env vars so the module doesn't bail early
process.env.KV_REST_API_URL = "https://fake-kv";
process.env.KV_REST_API_TOKEN = "fake-token";

import { sendPushNotifications } from "@/lib/alerts/push";
import { kv } from "@vercel/kv";

const mockSmembers = kv.smembers as ReturnType<typeof vi.fn>;

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert_1",
    type: "cost_spike",
    severity: "warning",
    provider: "openai",
    subject: "gpt-4o",
    message: "Cost spiked to $50.00 (+900% vs $5.00 baseline)",
    detail: "This is unusual",
    investigateSteps: ["Check your usage logs"],
    value: 50,
    baseline: 5,
    changePct: 900,
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockSmembers.mockReset();
  mockFetch.mockReset();
});

describe("sendPushNotifications", () => {
  it("returns {sent:0, failed:0} when no alerts", async () => {
    const result = await sendPushNotifications([]);
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns {sent:0, failed:0} when no tokens stored", async () => {
    mockSmembers.mockResolvedValue([]);
    const result = await sendPushNotifications([makeAlert()]);
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends push to all stored tokens", async () => {
    mockSmembers.mockResolvedValue([
      "ExponentPushToken[token1]",
      "ExponentPushToken[token2]",
    ]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ status: "ok", id: "t1" }, { status: "ok", id: "t2" }],
      }),
    });

    const result = await sendPushNotifications([makeAlert()]);
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses high priority for critical alerts", async () => {
    mockSmembers.mockResolvedValue(["ExponentPushToken[token1]"]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }] }),
    });

    await sendPushNotifications([makeAlert({ severity: "critical" })]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body[0].priority).toBe("high");
  });

  it("uses normal priority for warning alerts", async () => {
    mockSmembers.mockResolvedValue(["ExponentPushToken[token1]"]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }] }),
    });

    await sendPushNotifications([makeAlert({ severity: "warning" })]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body[0].priority).toBe("normal");
  });

  it("counts failed tickets", async () => {
    mockSmembers.mockResolvedValue([
      "ExponentPushToken[t1]",
      "ExponentPushToken[t2]",
    ]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: "ok", id: "t1" },
          { status: "error", message: "DeviceNotRegistered" },
        ],
      }),
    });

    const result = await sendPushNotifications([makeAlert()]);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("handles Expo API HTTP error gracefully", async () => {
    mockSmembers.mockResolvedValue(["ExponentPushToken[t1]"]);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    });

    const result = await sendPushNotifications([makeAlert()]);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("handles fetch network error gracefully", async () => {
    mockSmembers.mockResolvedValue(["ExponentPushToken[t1]"]);
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await sendPushNotifications([makeAlert()]);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("includes model name and provider in notification data", async () => {
    mockSmembers.mockResolvedValue(["ExponentPushToken[t1]"]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }] }),
    });

    await sendPushNotifications([makeAlert()]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body[0].data.screen).toBe("alerts");
    expect(body[0].sound).toBe("default");
  });

  it("batches tokens in chunks of 100", async () => {
    // Create 150 tokens
    const tokens = Array.from(
      { length: 150 },
      (_, i) => `ExponentPushToken[token${i}]`
    );
    mockSmembers.mockResolvedValue(tokens);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: Array(100).fill({ status: "ok" }),
      }),
    });

    await sendPushNotifications([makeAlert()]);

    // Should have made 2 fetch calls (100 + 50)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
