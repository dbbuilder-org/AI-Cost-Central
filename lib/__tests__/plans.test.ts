import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, getPlanLimits, getPlanFromPriceId } from "@/lib/plans";

describe("PLAN_LIMITS", () => {
  it("free plan has correct limits", () => {
    expect(PLAN_LIMITS.free.members).toBe(1);
    expect(PLAN_LIMITS.free.apiKeys).toBe(2);
    expect(PLAN_LIMITS.free.historyDays).toBe(28);
    expect(PLAN_LIMITS.free.alertsEnabled).toBe(false);
    expect(PLAN_LIMITS.free.forecastEnabled).toBe(false);
    expect(PLAN_LIMITS.free.briefsEnabled).toBe(false);
  });

  it("growth plan has unlimited keys and 90d history", () => {
    expect(PLAN_LIMITS.growth.apiKeys).toBe(Infinity);
    expect(PLAN_LIMITS.growth.historyDays).toBe(90);
    expect(PLAN_LIMITS.growth.alertsEnabled).toBe(true);
    expect(PLAN_LIMITS.growth.briefsEnabled).toBe(true);
  });

  it("business plan has unlimited members and 365d history", () => {
    expect(PLAN_LIMITS.business.members).toBe(Infinity);
    expect(PLAN_LIMITS.business.historyDays).toBe(365);
    expect(PLAN_LIMITS.business.apiAccess).toBe(true);
  });

  it("enterprise plan has all features enabled", () => {
    expect(PLAN_LIMITS.enterprise.historyDays).toBe(730);
    expect(PLAN_LIMITS.enterprise.apiAccess).toBe(true);
    expect(PLAN_LIMITS.enterprise.members).toBe(Infinity);
  });

  it("plan limits are strictly ordered (more expensive = more features)", () => {
    expect(PLAN_LIMITS.growth.historyDays).toBeGreaterThan(PLAN_LIMITS.free.historyDays);
    expect(PLAN_LIMITS.business.historyDays).toBeGreaterThan(PLAN_LIMITS.growth.historyDays);
    expect(PLAN_LIMITS.enterprise.historyDays).toBeGreaterThanOrEqual(PLAN_LIMITS.business.historyDays);
  });
});

describe("getPlanLimits", () => {
  it("returns correct limits for known plans", () => {
    expect(getPlanLimits("free").members).toBe(1);
    expect(getPlanLimits("growth").members).toBe(10);
    expect(getPlanLimits("business").members).toBe(Infinity);
  });

  it("defaults to free for unknown plan strings", () => {
    expect(getPlanLimits("unknown").members).toBe(1);
    expect(getPlanLimits("").historyDays).toBe(28);
  });
});

describe("getPlanFromPriceId", () => {
  it("returns free for unknown price IDs", () => {
    expect(getPlanFromPriceId("price_unknown_xyz")).toBe("free");
    expect(getPlanFromPriceId("")).toBe("free");
  });

  it("returns correct plan for env-var-based price IDs", () => {
    // These use the fallback strings when env vars aren't set
    expect(getPlanFromPriceId("price_growth_monthly")).toBe("growth");
    expect(getPlanFromPriceId("price_growth_annual")).toBe("growth");
    expect(getPlanFromPriceId("price_business_monthly")).toBe("business");
    expect(getPlanFromPriceId("price_business_annual")).toBe("business");
  });
});
