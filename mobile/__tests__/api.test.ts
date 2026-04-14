/**
 * Tests for the mobile API client module.
 * Uses fetch mock to avoid real network calls.
 */

import { setApiBaseUrl, getApiBaseUrl, fetchSummary, fetchAlerts, fetchKeys } from "@/lib/api";

// Minimal fetch mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  setApiBaseUrl("https://test.example.com");
});

describe("setApiBaseUrl / getApiBaseUrl", () => {
  it("stores and returns the base URL", () => {
    setApiBaseUrl("https://my-app.vercel.app");
    expect(getApiBaseUrl()).toBe("https://my-app.vercel.app");
  });

  it("strips trailing slash", () => {
    setApiBaseUrl("https://my-app.vercel.app/");
    expect(getApiBaseUrl()).toBe("https://my-app.vercel.app");
  });
});

describe("fetchSummary", () => {
  it("calls /api/dashboard/summary with days param", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalCostUSD: 42.5,
        totalRequests: 100,
        changePct: 5.2,
        byDay: [],
        byModel: [],
        periodDays: 7,
        fetchedAt: new Date().toISOString(),
      }),
    });

    const result = await fetchSummary(7);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.example.com/api/dashboard/summary?days=7",
      expect.any(Object)
    );
    expect(result.totalCostUSD).toBe(42.5);
    expect(result.totalRequests).toBe(100);
  });

  it("throws when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    await expect(fetchSummary(28)).rejects.toThrow("Internal server error");
  });

  it("throws when no base URL is set", async () => {
    setApiBaseUrl("");
    await expect(fetchSummary()).rejects.toThrow("API base URL not configured");
  });
});

describe("fetchAlerts", () => {
  it("calls /api/alerts and returns array", async () => {
    const mockAlerts = [
      {
        id: "alert_1",
        type: "cost_spike",
        severity: "critical",
        provider: "openai",
        subject: "gpt-4o",
        message: "Cost spiked",
        detail: "Details here",
        investigateSteps: ["Step 1"],
        value: 100,
        baseline: 10,
        changePct: 900,
        detectedAt: new Date().toISOString(),
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAlerts,
    });

    const result = await fetchAlerts();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cost_spike");
    expect(result[0].severity).toBe("critical");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.example.com/api/alerts",
      expect.any(Object)
    );
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    await expect(fetchAlerts()).rejects.toThrow("Network failure");
  });
});

describe("fetchKeys", () => {
  it("calls /api/keys/all and returns key list", async () => {
    const mockKeys = [
      {
        id: "key_123",
        name: "Production Key",
        provider: "anthropic",
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
        hint: "sk-ant",
        isNew: false,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKeys,
    });

    const result = await fetchKeys();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("key_123");
    expect(result[0].provider).toBe("anthropic");
  });
});

describe("error handling", () => {
  it("includes error message from API response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized — check your API key" }),
    });

    await expect(fetchSummary()).rejects.toThrow("Unauthorized — check your API key");
  });

  it("falls back to statusText when JSON parse fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => { throw new Error("not json"); },
    });

    await expect(fetchSummary()).rejects.toThrow("Service Unavailable");
  });
});
