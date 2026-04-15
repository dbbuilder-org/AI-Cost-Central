/**
 * SmartRouter /v1/chat/completions integration tests.
 *
 * Strategy:
 * - Mock `fetch` globally to intercept provider calls
 * - Mock `@/lib/db` so DB inserts don't need a real database
 * - Use SMARTROUTER_MASTER_KEY env var to simulate valid virtual keys
 * - Test: auth, passthrough, routing decisions, streaming path, error handling
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock DB to prevent real Neon calls
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        catch: vi.fn(),
      }),
    }),
  },
  schema: {
    requestLogs: {},
  },
}));

// Set env before module import
process.env.SMARTROUTER_MASTER_KEY = "sk-sr-test-master-key";
process.env.SMARTROUTER_AUTO_ROUTE = "false";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { POST } from "@/app/v1/chat/completions/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function openAIResponse(model = "gpt-4o-mini", inputTokens = 100, outputTokens = 50) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "chatcmpl-test",
      object: "chat.completion",
      model,
      choices: [{ index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Auth tests ────────────────────────────────────────────────────────────────

describe("authentication", () => {
  it("returns 401 with no Authorization header", async () => {
    const req = makeRequest({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 401 with invalid virtual key", async () => {
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      "Bearer sk-sr-wrong-key"
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts valid master virtual key", async () => {
    mockFetch.mockResolvedValue(openAIResponse());
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    expect(res.status).not.toBe(401);
  });

  it("accepts direct OpenAI key as passthrough", async () => {
    mockFetch.mockResolvedValue(openAIResponse());
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      "Bearer sk-real-openai-key"
    );
    const res = await POST(req);
    expect(res.status).not.toBe(401);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.anything()
    );
  });
});

// ── Request body ──────────────────────────────────────────────────────────────

describe("request body handling", () => {
  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-openai-passthrough",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ── Passthrough mode ─────────────────────────────────────────────────────────

describe("passthrough (direct OpenAI keys)", () => {
  it("forwards request to OpenAI with requested model unchanged", async () => {
    mockFetch.mockResolvedValue(openAIResponse("gpt-4o"));
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "tell me a joke" }] },
      "Bearer sk-passthrough-key"
    );
    await POST(req);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe("gpt-4o");
  });

  it("includes provider response body in reply", async () => {
    mockFetch.mockResolvedValue(openAIResponse("gpt-4o"));
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      "Bearer sk-test"
    );
    const res = await POST(req);
    const body = await res.json() as { object: string };
    expect(body.object).toBe("chat.completion");
  });
});

// ── Virtual key routing ───────────────────────────────────────────────────────

describe("virtual key routing", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-openai-real";
  });

  it("injects _smartrouter metadata into response", async () => {
    mockFetch.mockResolvedValue(openAIResponse("gpt-4o-mini"));
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "extract all values" }], temperature: 0.1, response_format: { type: "json_object" } },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    const body = await res.json() as { _smartrouter?: { model_requested: string } };
    expect(body._smartrouter).toBeDefined();
    expect(body._smartrouter!.model_requested).toBe("gpt-4o");
  });

  it("includes x-sr-* headers in response", async () => {
    mockFetch.mockResolvedValue(openAIResponse("gpt-4o-mini"));
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    expect(res.headers.get("x-sr-model-requested")).toBe("gpt-4o");
    expect(res.headers.get("x-sr-task-type")).toBeTruthy();
  });

  it("uses real token counts from provider response for cost", async () => {
    mockFetch.mockResolvedValue(openAIResponse("gpt-4o", 200, 100));
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    const body = await res.json() as { _smartrouter: { cost_usd: number } };
    // Cost should be based on actual token counts (200 in, 100 out)
    expect(body._smartrouter.cost_usd).toBeGreaterThan(0);
  });
});

// ── Virtual model aliases ────────────────────────────────────────────────────

describe("virtual model aliases", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-openai-real";
  });

  it("resolves smart-cheap to a real model", async () => {
    mockFetch.mockResolvedValue(openAIResponse("gpt-4.1-nano"));
    const req = makeRequest(
      { model: "smart-cheap", messages: [{ role: "user", content: "classify this" }] },
      "Bearer sk-sr-test-master-key"
    );
    await POST(req);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    // Should route to a cheap model — not "smart-cheap"
    expect(body.model).not.toBe("smart-cheap");
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-openai-real";
  });

  it("returns 502 when provider is unreachable", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("passes through provider error status codes", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Rate limited", type: "rate_limit_error" } }),
    });
    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      "Bearer sk-passthrough"
    );
    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});

// ── Streaming ────────────────────────────────────────────────────────────────

describe("streaming", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-openai-real";
  });

  it("returns text/event-stream content type for stream requests", async () => {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
        c.enqueue(encoder.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: streamBody });

    const req = makeRequest(
      { model: "gpt-4o", messages: [{ role: "user", content: "hi" }], stream: true },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("includes x-sr headers in streaming response", async () => {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: streamBody });

    const req = makeRequest(
      { model: "smart-balanced", messages: [{ role: "user", content: "hi" }], stream: true },
      "Bearer sk-sr-test-master-key"
    );
    const res = await POST(req);
    expect(res.headers.get("x-sr-model-requested")).toBe("smart-balanced");
  });
});
