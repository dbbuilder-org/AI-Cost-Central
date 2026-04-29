import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

const { mockFindFirst, mockInsert, mockUpdate } = vi.hoisted(() => {
  const mockFindFirst = vi.fn();
  const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockUpdateWhere = vi.fn(() => Promise.resolve());
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  return { mockFindFirst, mockInsert, mockUpdate };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      renderServices: { findFirst: mockFindFirst },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: {
    renderServices: {},
  },
}));

import { scanRenderServices } from "@/lib/security/renderMonitor";

const RENDER_SERVICE_BASE = {
  id: "svc_1",
  name: "my-api",
  type: "web_service",
  repo: { owner: "dbbuilder-org", name: "my-api", branch: "main" },
  serviceDetails: { url: "https://my-api.onrender.com" },
  suspended: "not_suspended",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

function mockRenderResponse(services: object[], status = 200) {
  mockFetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify(services.map((s) => ({ service: s }))),
      { status, headers: { "content-type": "application/json" } },
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RENDER_API_KEY = "rnd-test-key";
  process.env.KNOWN_GITHUB_OWNERS = "dbbuilder-org,chris-therriault";
});

describe("scanRenderServices", () => {
  it("returns [] when RENDER_API_KEY is not set", async () => {
    delete process.env.RENDER_API_KEY;
    const result = await scanRenderServices();
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] when Render API returns non-ok status", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const result = await scanRenderServices();
    expect(result).toEqual([]);
  });

  it("returns [] for new service from a known GitHub owner", async () => {
    mockRenderResponse([RENDER_SERVICE_BASE]);
    mockFindFirst.mockResolvedValueOnce(null); // new service

    const result = await scanRenderServices();
    expect(result).toEqual([]);
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it("flags new service with unknown GitHub owner", async () => {
    const svc = {
      ...RENDER_SERVICE_BASE,
      id: "svc_rogue",
      name: "rogue-service",
      repo: { owner: "attacker-org", name: "rogue", branch: "main" },
    };
    mockRenderResponse([svc]);
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await scanRenderServices();
    expect(result).toHaveLength(1);
    expect(result[0].serviceId).toBe("svc_rogue");
    expect(result[0].reason).toContain("Unknown GitHub owner");
  });

  it("flags new service matching a suspicious name pattern", async () => {
    const svc = {
      ...RENDER_SERVICE_BASE,
      id: "svc_relay",
      name: "ws-relay",
      repo: { owner: "dbbuilder-org", name: "ws-relay", branch: "main" },
    };
    mockRenderResponse([svc]);
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await scanRenderServices();
    expect(result).toHaveLength(1);
    expect(result[0].reason).toMatch(/suspicious.*pattern/i);
  });

  it("flags service whose repo name matches suspicious pattern", async () => {
    const svc = {
      ...RENDER_SERVICE_BASE,
      id: "svc_tunnel",
      name: "harmless-name",
      repo: { owner: "dbbuilder-org", name: "tunnel-backdoor", branch: "main" },
    };
    mockRenderResponse([svc]);
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await scanRenderServices();
    expect(result).toHaveLength(1);
    expect(result[0].serviceId).toBe("svc_tunnel");
  });

  it("updates lastSeenAt for existing known service (no anomaly)", async () => {
    mockRenderResponse([RENDER_SERVICE_BASE]);
    mockFindFirst.mockResolvedValueOnce({
      serviceId: "svc_1",
      isKnown: true,
      suspiciousReason: null,
    });

    const result = await scanRenderServices();
    expect(result).toEqual([]);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("re-flags existing service with prior suspicious reason that was never cleared", async () => {
    mockRenderResponse([RENDER_SERVICE_BASE]);
    mockFindFirst.mockResolvedValueOnce({
      serviceId: "svc_1",
      name: "my-api",
      isKnown: false,
      suspiciousReason: "Unknown GitHub owner: old-attacker",
    });

    const result = await scanRenderServices();
    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("Unknown GitHub owner");
  });

  it("sends Authorization: Bearer header to Render API", async () => {
    mockRenderResponse([RENDER_SERVICE_BASE]);
    mockFindFirst.mockResolvedValueOnce({ isKnown: true, suspiciousReason: null });

    await scanRenderServices();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer rnd-test-key");
  });
});
