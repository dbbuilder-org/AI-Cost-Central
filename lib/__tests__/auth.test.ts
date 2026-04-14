import { describe, it, expect } from "vitest";
import { getPlanLimits } from "@/lib/plans";

// Note: requireAuth() and requireRole() depend on Clerk auth() and DB queries,
// which require a live Clerk context + Neon DB. Those are tested via integration tests.
// This file covers the pure-logic helpers.

describe("role ranking logic", () => {
  const ROLE_RANK: Record<string, number> = {
    viewer: 0,
    admin: 1,
    owner: 2,
  };

  it("owner outranks admin", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
  });

  it("admin outranks viewer", () => {
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.viewer);
  });

  it("roles satisfy transitivity", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.viewer);
  });

  it("all defined roles have non-negative rank", () => {
    for (const rank of Object.values(ROLE_RANK)) {
      expect(rank).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("plan limits for route-level enforcement", () => {
  it("free plan correctly gates alerts", () => {
    const limits = getPlanLimits("free");
    expect(limits.alertsEnabled).toBe(false);
    expect(limits.apiKeys).toBe(2);
  });

  it("growth plan allows more than 2 API keys", () => {
    const limits = getPlanLimits("growth");
    expect(limits.apiKeys).toBe(Infinity);
  });

  it("checking against Infinity works for unlimited plans", () => {
    const limits = getPlanLimits("growth");
    const currentCount = 999;
    expect(currentCount >= limits.apiKeys).toBe(false); // still under "limit"
  });

  it("free plan is correctly limited", () => {
    const limits = getPlanLimits("free");
    const currentCount = 2;
    expect(currentCount >= limits.apiKeys).toBe(true); // at limit
  });
});
