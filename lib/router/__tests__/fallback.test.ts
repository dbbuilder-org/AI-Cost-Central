import { describe, it, expect, vi, beforeEach } from "vitest";
import { forwardWithFallback } from "@/lib/router/fallback";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const PRIMARY = {
  provider: "openai",
  providerUrl: "https://api.openai.com/v1/chat/completions",
  providerKey: "sk-test",
  modelId: "gpt-4o-mini",
};

const FALLBACK = {
  provider: "anthropic",
  providerUrl: "https://api.anthropic.com/v1/messages",
  providerKey: "ant-test",
  modelId: "claude-haiku-4-5",
};

const BODY = { model: "gpt-4o-mini", messages: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forwardWithFallback", () => {
  it("returns primary response when it succeeds", async () => {
    const okResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    mockFetch.mockResolvedValueOnce(okResponse);

    const result = await forwardWithFallback(PRIMARY, [FALLBACK], BODY);
    expect(result.providerUsed).toBe("openai");
    expect(result.fallbackCount).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to secondary on 429 from primary", async () => {
    const rateLimited = new Response("rate limited", { status: 429 });
    const ok = new Response(JSON.stringify({ ok: true }), { status: 200 });
    mockFetch.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok);

    const result = await forwardWithFallback(PRIMARY, [FALLBACK], BODY);
    expect(result.providerUsed).toBe("anthropic");
    expect(result.fallbackCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to secondary on 503 from primary", async () => {
    const serverErr = new Response("unavailable", { status: 503 });
    const ok = new Response(JSON.stringify({ ok: true }), { status: 200 });
    mockFetch.mockResolvedValueOnce(serverErr).mockResolvedValueOnce(ok);

    const result = await forwardWithFallback(PRIMARY, [FALLBACK], BODY);
    expect(result.providerUsed).toBe("anthropic");
    expect(result.fallbackCount).toBe(1);
  });

  it("does not fall back on 400 (client error)", async () => {
    const badRequest = new Response("bad request", { status: 400 });
    mockFetch.mockResolvedValueOnce(badRequest);

    const result = await forwardWithFallback(PRIMARY, [FALLBACK], BODY);
    expect(result.providerUsed).toBe("openai");
    expect(result.fallbackCount).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns last response when all attempts fail with retryable status", async () => {
    const err429 = new Response("rate limited", { status: 429 });
    const err503 = new Response("unavailable", { status: 503 });
    mockFetch.mockResolvedValueOnce(err429).mockResolvedValueOnce(err503);

    const result = await forwardWithFallback(PRIMARY, [FALLBACK], BODY);
    // Last attempt result returned even if still 503
    expect(result.response.status).toBe(503);
    expect(result.fallbackCount).toBe(1);
  });

  it("throws when primary has network error and no fallback", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(forwardWithFallback(PRIMARY, [], BODY)).rejects.toThrow("ECONNREFUSED");
  });

  it("caps fallbacks at MAX_FALLBACKS (2)", async () => {
    const err = new Response("429", { status: 429 });
    const ok = new Response("{}", { status: 200 });
    // Primary + 2 fallbacks + 1 extra (should be ignored)
    mockFetch
      .mockResolvedValueOnce(err)
      .mockResolvedValueOnce(err)
      .mockResolvedValueOnce(ok);

    const extra = { ...FALLBACK, provider: "groq" };
    const extra2 = { ...FALLBACK, provider: "mistral" };
    const extra3 = { ...FALLBACK, provider: "google" }; // should be cut off

    const result = await forwardWithFallback(PRIMARY, [extra, extra2, extra3], BODY);
    expect(mockFetch).toHaveBeenCalledTimes(3); // primary + 2 fallbacks only
    expect(result.fallbackCount).toBe(2);
  });
});
