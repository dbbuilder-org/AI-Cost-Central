import { describe, it, expect, vi, afterEach } from "vitest";
import { testApiKey } from "@/lib/keyHealth";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(status: number, ok = status >= 200 && status < 300) {
  global.fetch = vi.fn().mockResolvedValue({ ok, status, text: async () => "error" });
}

function mockFetchFailure(message = "ECONNREFUSED") {
  global.fetch = vi.fn().mockRejectedValue(new Error(message));
}

describe("testApiKey", () => {
  it("openai: returns ok:true on 200", async () => {
    mockFetch(200);
    const result = await testApiKey("openai", "sk-test");
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("openai: returns ok:false on 401", async () => {
    mockFetch(401, false);
    const result = await testApiKey("openai", "bad-key");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("openai: returns ok:false on network failure", async () => {
    mockFetchFailure("ECONNREFUSED");
    const result = await testApiKey("openai", "sk-test");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("anthropic: treats 400 as ok (key valid, bad request)", async () => {
    mockFetch(400, false);
    const result = await testApiKey("anthropic", "sk-ant-test");
    // 400 = valid key, just bad minimal request format
    expect(result.ok).toBe(true);
  });

  it("anthropic: returns ok:false on 401", async () => {
    mockFetch(401, false);
    const result = await testApiKey("anthropic", "bad-key");
    expect(result.ok).toBe(false);
  });

  it("google: passes key as query param", async () => {
    mockFetch(200);
    await testApiKey("google", "AIza-test-key");
    expect(global.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.stringContaining("AIza-test-key"),
      expect.any(Object),
    );
  });

  it("groq: returns ok:true on 200", async () => {
    mockFetch(200);
    const result = await testApiKey("groq", "gsk-test");
    expect(result.ok).toBe(true);
  });

  it("mistral: returns ok:true on 200", async () => {
    mockFetch(200);
    const result = await testApiKey("mistral", "msk-test");
    expect(result.ok).toBe(true);
  });

  it("cohere: returns ok:true on 200", async () => {
    mockFetch(200);
    const result = await testApiKey("cohere", "co-test");
    expect(result.ok).toBe(true);
  });

  it("unknown provider: returns ok:false with error", async () => {
    const result = await testApiKey("nonexistent", "key");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("nonexistent");
  });

  it("returns latencyMs as a number", async () => {
    mockFetch(200);
    const result = await testApiKey("openai", "sk-test");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
