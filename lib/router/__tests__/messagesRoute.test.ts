import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("@/lib/router/virtualKeys", () => ({
  resolveVirtualKeyForAnthropic: vi.fn(),
}));

vi.mock("@/lib/router/budget", () => ({
  checkBudget: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        catch: vi.fn(),
      })),
    })),
  },
  schema: {
    requestLogs: {},
  },
}));

import { POST } from "@/app/v1/messages/route";
import { resolveVirtualKeyForAnthropic } from "@/lib/router/virtualKeys";
import { checkBudget } from "@/lib/router/budget";

const mockResolve = resolveVirtualKeyForAnthropic as ReturnType<typeof vi.fn>;
const mockBudget = checkBudget as ReturnType<typeof vi.fn>;

const VALID_CTX = {
  orgId: "org_1",
  projectId: "proj_1",
  realApiKey: "sk-ant-real",
  dailyBudgetUsd: null,
};

function makeReq(opts: {
  apiKey?: string;
  body?: unknown;
} = {}) {
  return new Request("http://localhost/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.apiKey !== undefined ? { "x-api-key": opts.apiKey } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockReturnValue(VALID_CTX);
  mockBudget.mockResolvedValue({ exceeded: false });
});

describe("POST /v1/messages", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe("authentication_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 401 when virtual key is not registered", async () => {
    mockResolve.mockReturnValue(null);
    const res = await POST(makeReq({ apiKey: "sk-sr-unknown" }) as never);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 429 when daily budget is exceeded", async () => {
    mockResolve.mockReturnValue({ ...VALID_CTX, dailyBudgetUsd: 10 });
    mockBudget.mockResolvedValue({ exceeded: true, reason: "Daily budget of $10.00 exceeded" });

    const res = await POST(makeReq({ apiKey: "sk-sr-upapply", body: { model: "claude-haiku-4-5", messages: [] } }) as never);
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe("rate_limit_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: { "x-api-key": "sk-sr-upapply", "content-type": "application/json" },
      body: "{ not valid json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 502 when upstream fetch throws (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await POST(makeReq({ apiKey: "sk-sr-upapply", body: { model: "claude-haiku-4-5", messages: [] } }) as never);
    expect(res.status).toBe(502);
    const body = await res.json() as { error: { type: string } };
    expect(body.error.type).toBe("api_error");
  });

  it("forwards non-streaming upstream response with correct status", async () => {
    const upstreamBody = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await POST(makeReq({ apiKey: "sk-sr-upapply", body: { model: "claude-haiku-4-5", messages: [] } }) as never);
    expect(res.status).toBe(200);
    const body = await res.json() as typeof upstreamBody;
    expect(body.id).toBe("msg_1");
  });

  it("forwards the real API key to upstream (not the virtual key)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })
    );

    await POST(makeReq({ apiKey: "sk-sr-upapply", body: { model: "claude-haiku-4-5", messages: [] } }) as never);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentHeaders = new Headers(init.headers as HeadersInit);
    expect(sentHeaders.get("x-api-key")).toBe("sk-ant-real");
  });

  it("forwards upstream 4xx errors to caller unchanged", async () => {
    const errBody = { type: "error", error: { type: "authentication_error", message: "Invalid API key" } };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(errBody), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await POST(makeReq({ apiKey: "sk-sr-upapply", body: { model: "claude-haiku-4-5", messages: [] } }) as never);
    expect(res.status).toBe(401);
  });

  it("does not forward stripped headers (authorization, host, content-encoding)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ usage: {} }), { status: 200 })
    );

    const req = new Request("http://localhost/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": "sk-sr-upapply",
        "content-type": "application/json",
        "authorization": "Bearer should-be-stripped",
        "host": "localhost",
      },
      body: JSON.stringify({ model: "claude-haiku-4-5", messages: [] }),
    });

    await POST(req as never);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentHeaders = new Headers(init.headers as HeadersInit);
    expect(sentHeaders.get("authorization")).toBeNull();
    expect(sentHeaders.get("host")).toBeNull();
  });
});
