import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB before importing the module
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
  schema: {
    routingExperiments: {
      orgId: "org_id",
      projectId: "project_id",
      status: "status",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

import { db } from "@/lib/db";
import { assignExperiment } from "@/lib/router/experiment";

const ACTIVE_EXP = {
  id: "exp-1",
  orgId: "org_1",
  projectId: "proj_1",
  name: "GPT-4o vs GPT-4o-mini",
  controlModel: "gpt-4o",
  treatmentModel: "gpt-4o-mini",
  splitPct: 50,
  taskTypes: [],
  status: "active",
  winnerVariant: null,
  startedAt: new Date(),
  concludedAt: null,
  createdAt: new Date(),
  description: null,
};

function makeChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assignExperiment", () => {
  it("returns null for passthrough orgId", async () => {
    const result = await assignExperiment("passthrough", "proj_1", "chat", "nonce");
    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns null when no active experiment", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]) as never);
    const result = await assignExperiment("org_1", "proj_1", "chat", "nonce");
    expect(result).toBeNull();
  });

  it("returns control variant based on deterministic hash", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([ACTIVE_EXP]) as never);
    // Run many nonces — roughly 50% should be treatment
    const assignments = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        assignExperiment("org_1", "proj_1", "chat", `nonce-${i}`)
      )
    );
    const treatments = assignments.filter((a) => a?.variant === "treatment");
    const controls = assignments.filter((a) => a?.variant === "control");
    // With 50% split, expect roughly 40–60 in each bucket
    expect(treatments.length).toBeGreaterThan(30);
    expect(controls.length).toBeGreaterThan(30);
  });

  it("always returns same variant for same nonce", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([ACTIVE_EXP]) as never);
    const a = await assignExperiment("org_1", "proj_1", "chat", "fixed-nonce");
    vi.mocked(db.select).mockReturnValue(makeChain([ACTIVE_EXP]) as never);
    const b = await assignExperiment("org_1", "proj_1", "chat", "fixed-nonce");
    expect(a?.variant).toBe(b?.variant);
  });

  it("returns null if task type not in experiment scope", async () => {
    const scopedExp = { ...ACTIVE_EXP, taskTypes: ["coding"] };
    vi.mocked(db.select).mockReturnValue(makeChain([scopedExp]) as never);
    const result = await assignExperiment("org_1", "proj_1", "chat", "nonce");
    expect(result).toBeNull();
  });

  it("assigns when task type matches experiment scope", async () => {
    const scopedExp = { ...ACTIVE_EXP, taskTypes: ["coding"] };
    vi.mocked(db.select).mockReturnValue(makeChain([scopedExp]) as never);
    const result = await assignExperiment("org_1", "proj_1", "coding", "nonce");
    expect(result).not.toBeNull();
    expect(result?.experimentId).toBe("exp-1");
  });

  it("returns null on DB error (fail-open)", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB down");
    });
    const result = await assignExperiment("org_1", "proj_1", "chat", "nonce");
    expect(result).toBeNull();
  });
});
