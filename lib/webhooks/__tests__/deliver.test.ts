import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared hook fixture — mutate per test
let mockHooks: unknown[] = [];

// Build a thenable query chain that also supports `.where()`
function makeChain() {
  const data = mockHooks;
  return {
    where: vi.fn().mockResolvedValue(data),
    then(resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(data).then(resolve, reject);
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    // Each call to select() returns a fresh chain reading mockHooks at call time
    select: vi.fn(() => ({ from: vi.fn(() => makeChain()) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
  },
  schema: {
    orgWebhooks: { orgId: "org_id", id: "id", isActive: "is_active" },
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("deliverWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHooks = [];
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it("does nothing when no matching webhooks", async () => {
    mockHooks = [];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("alert.fired", { count: 1 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delivers to active hooks subscribed to the event", async () => {
    mockHooks = [
      { id: "hook_1", url: "https://example.com/hook", events: ["alert.fired"], isActive: true, secret: null, failureCount: 0 },
    ];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("alert.fired", { count: 1 });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/hook", expect.objectContaining({ method: "POST" }));
  });

  it("skips hooks not subscribed to the event", async () => {
    mockHooks = [
      { id: "hook_2", url: "https://example.com/other", events: ["budget.exceeded"], isActive: true, secret: null, failureCount: 0 },
    ];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("alert.fired", { count: 1 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delivers to hooks with empty events array (subscribed to all)", async () => {
    mockHooks = [
      { id: "hook_3", url: "https://example.com/all", events: [], isActive: true, secret: null, failureCount: 0 },
    ];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("model.price_changed", { changes: [] });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("skips inactive hooks", async () => {
    mockHooks = [
      { id: "hook_4", url: "https://example.com/dead", events: [], isActive: false, secret: null, failureCount: 5 },
    ];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("alert.fired", {});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("adds HMAC signature header when secret configured", async () => {
    mockHooks = [
      { id: "hook_5", url: "https://example.com/signed", events: [], isActive: true, secret: "my-secret", failureCount: 0 },
    ];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("alert.fired", {});
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["X-AICC-Signature"]).toMatch(/^sha256=[a-f0-9]+$/);
  });

  it("does not include signature header when no secret", async () => {
    mockHooks = [
      { id: "hook_6", url: "https://example.com/unsigned", events: [], isActive: true, secret: null, failureCount: 0 },
    ];
    const { deliverWebhookEvent } = await import("@/lib/webhooks/deliver");
    await deliverWebhookEvent("alert.fired", {});
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["X-AICC-Signature"]).toBeUndefined();
  });
});
