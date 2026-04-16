import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock requireAuth, requireRole, db
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({ orgId: "org_test", userId: "user_test" }),
  requireRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      projects: {
        findFirst: vi.fn().mockResolvedValue({
          id: "proj_abc",
          name: "Test Project",
          routingConfig: { qualityTier: "balanced", autoRoute: true },
        }),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  schema: {
    projects: { id: "id", orgId: "org_id", routingConfig: "routing_config" },
  },
}));

import { GET, PUT } from "@/app/api/org/projects/[projectId]/routing/route";
import { NextRequest } from "next/server";

function makeReq(method: string, body?: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost/api/org/projects/proj_abc/routing"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ projectId: "proj_abc" });

describe("GET /api/org/projects/[projectId]/routing", () => {
  it("returns the current routing config", async () => {
    const res = await GET(makeReq("GET"), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.qualityTier).toBe("balanced");
    expect(data.projectId).toBe("proj_abc");
  });

  it("returns 404 when project not found", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET(makeReq("GET"), { params });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/org/projects/[projectId]/routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a valid config", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "proj_abc" });
    const res = await PUT(makeReq("PUT", { qualityTier: "economy", autoRoute: false }), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.qualityTier).toBe("economy");
    expect(data.config.autoRoute).toBe(false);
  });

  it("rejects an invalid qualityTier", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "proj_abc" });
    const res = await PUT(makeReq("PUT", { qualityTier: "super-max" }), { params });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown provider in allowedProviders", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "proj_abc" });
    const res = await PUT(makeReq("PUT", { allowedProviders: ["openai", "fakeProvider"] }), { params });
    expect(res.status).toBe(400);
  });

  it("accepts dailyBudgetUsd + budgetAction", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "proj_abc" });
    const res = await PUT(makeReq("PUT", { dailyBudgetUsd: 5, budgetAction: "block" }), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.dailyBudgetUsd).toBe(5);
    expect(data.config.budgetAction).toBe("block");
  });

  it("accepts null to clear a budget limit", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "proj_abc" });
    const res = await PUT(makeReq("PUT", { dailyBudgetUsd: null }), { params });
    expect(res.status).toBe(200);
  });

  it("returns 404 when project not found", async () => {
    const { db } = await import("@/lib/db");
    (db.query.projects.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(makeReq("PUT", { qualityTier: "balanced" }), { params });
    expect(res.status).toBe(404);
  });
});
