import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectiveTier } from "@/lib/router/budget";
import type { BudgetStatus } from "@/lib/router/budget";

// checkBudget hits the DB — test effectiveTier (pure) and the DB path separately

describe("effectiveTier", () => {
  it("returns the requested tier when budget is not exceeded", () => {
    const status: BudgetStatus = { exceeded: false };
    expect(effectiveTier("quality", status)).toBe("quality");
    expect(effectiveTier("max",     status)).toBe("max");
    expect(effectiveTier("economy", status)).toBe("economy");
  });

  it("downgrades to economy when budget exceeded and action=downgrade", () => {
    const status: BudgetStatus = { exceeded: true, action: "downgrade", reason: "budget hit" };
    expect(effectiveTier("quality",  status)).toBe("economy");
    expect(effectiveTier("balanced", status)).toBe("economy");
    expect(effectiveTier("max",      status)).toBe("economy");
  });

  it("returns economy as-is when action=block (caller handles the block)", () => {
    // When action=block the caller returns 429 before routing — effectiveTier is never called.
    // But if it is called, economy should be returned unchanged.
    const status: BudgetStatus = { exceeded: true, action: "block", reason: "budget hit" };
    expect(effectiveTier("quality", status)).toBe("quality"); // block doesn't downgrade
  });
});

// ── checkBudget DB integration ──────────────────────────────────────────────
// We mock the DB module so the test doesn't need a live Neon connection.

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from:   vi.fn().mockReturnThis(),
    where:  vi.fn().mockResolvedValue([{ total: "0.00" }]),
  },
  schema: { requestLogs: {} },
}));

describe("checkBudget (mocked DB)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns not exceeded when no limits configured", async () => {
    const { checkBudget } = await import("@/lib/router/budget");
    const result = await checkBudget("org_1", "proj_1", {});
    expect(result.exceeded).toBe(false);
  });

  it("returns not exceeded when spend is below daily limit", async () => {
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((db as any).where as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: "3.50" }]);
    const { checkBudget } = await import("@/lib/router/budget");
    const result = await checkBudget("org_1", "proj_1", { dailyBudgetUsd: 10 });
    expect(result.exceeded).toBe(false);
  });

  it("returns exceeded when spend meets or exceeds daily limit", async () => {
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((db as any).where as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: "10.00" }]);
    const { checkBudget } = await import("@/lib/router/budget");
    const result = await checkBudget("org_1", "proj_1", { dailyBudgetUsd: 10, budgetAction: "block" });
    expect(result.exceeded).toBe(true);
    if (result.exceeded) expect(result.action).toBe("block");
  });

  it("defaults to downgrade action when budgetAction not set", async () => {
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((db as any).where as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: "15.00" }]);
    const { checkBudget } = await import("@/lib/router/budget");
    const result = await checkBudget("org_1", "proj_1", { dailyBudgetUsd: 10 });
    expect(result.exceeded).toBe(true);
    if (result.exceeded) expect(result.action).toBe("downgrade");
  });

  it("fails open when DB throws (does not exceed)", async () => {
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((db as any).where as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB timeout"));
    const { checkBudget } = await import("@/lib/router/budget");
    const result = await checkBudget("org_1", "proj_1", { dailyBudgetUsd: 10 });
    expect(result.exceeded).toBe(false);
  });
});
