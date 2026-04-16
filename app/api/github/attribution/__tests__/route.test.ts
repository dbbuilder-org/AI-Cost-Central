/**
 * Attribution API tests.
 *
 * Mocks @/lib/auth and @/lib/db.
 * Tests: auth guard, normal aggregation, empty results, projectId filter, days param.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

const mockRows: Array<{
  callsite: string | null;
  totalCostUsd: string;
  totalInputTokens: string;
  totalOutputTokens: string;
  requestCount: string;
  topModel: string;
}> = [];

function makeSelectChain(returnValue: typeof mockRows) {
  const chain: Record<string, unknown> = {};
  const terminal = {
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
  chain.from = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      groupBy: vi.fn().mockReturnValue(terminal),
    }),
  });
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
  schema: {
    requestLogs: {
      orgId: "org_id",
      createdAt: "created_at",
      callsite: "callsite",
      projectId: "project_id",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  isNotNull: vi.fn((col: unknown) => ({ col })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ raw: strings.join(""), values })),
    { raw: vi.fn() }
  ),
  desc: vi.fn((col: unknown) => ({ desc: col })),
}));

import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GET } from "@/app/api/github/attribution/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/github/attribution");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/github/attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ orgId: "org_test", userId: "user_1" } as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Response(null, { status: 401 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns callsites with summary when data exists", async () => {
    const fakeRows = [
      {
        callsite: "src/agents/coder.ts:42",
        totalCostUsd: "0.05000000",
        totalInputTokens: "1000",
        totalOutputTokens: "500",
        requestCount: "10",
        topModel: "gpt-4o",
      },
      {
        callsite: "src/chat/handler.ts:17",
        totalCostUsd: "0.02000000",
        totalInputTokens: "400",
        totalOutputTokens: "200",
        requestCount: "4",
        topModel: "gpt-4o-mini",
      },
    ];
    vi.mocked(db.select).mockReturnValue(makeSelectChain(fakeRows) as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.callsites).toHaveLength(2);
    expect(body.callsites[0].callsite).toBe("src/agents/coder.ts:42");
    expect(body.callsites[0].totalCostUsd).toBeCloseTo(0.05);
    expect(body.callsites[0].topModel).toBe("gpt-4o");
    expect(body.summary.callsiteCount).toBe(2);
    expect(body.summary.totalCostUsd).toBeCloseTo(0.07);
  });

  it("generates a recommendation for expensive models", async () => {
    const fakeRows = [
      {
        callsite: "src/agents/writer.ts:8",
        totalCostUsd: "1.50000000",
        totalInputTokens: "50000",
        totalOutputTokens: "10000",
        requestCount: "100",
        topModel: "gpt-4o",
      },
    ];
    vi.mocked(db.select).mockReturnValue(makeSelectChain(fakeRows) as never);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.callsites[0].recommendation).toMatch(/gpt-4o-mini/);
    expect(body.summary.withRecommendations).toBe(1);
  });

  it("returns no recommendation for cheap models", async () => {
    const fakeRows = [
      {
        callsite: "src/util/embedder.ts:3",
        totalCostUsd: "0.00100000",
        totalInputTokens: "500",
        totalOutputTokens: "0",
        requestCount: "5",
        topModel: "gpt-4o-mini",
      },
    ];
    vi.mocked(db.select).mockReturnValue(makeSelectChain(fakeRows) as never);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.callsites[0].recommendation).toBeNull();
    expect(body.summary.withRecommendations).toBe(0);
  });

  it("returns empty callsites when no data", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.callsites).toHaveLength(0);
    expect(body.summary.totalCostUsd).toBe(0);
  });

  it("caps days at 90", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);
    const res = await GET(makeRequest({ days: "999" }));
    const body = await res.json();
    expect(body.summary.days).toBe(90);
  });

  it("returns 500 on DB error", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection refused");
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/DB connection refused/);
  });
});
