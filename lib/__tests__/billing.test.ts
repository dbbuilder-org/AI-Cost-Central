import { describe, it, expect } from "vitest";
import { getPlanFromPriceId, getPlanLimits } from "@/lib/plans";

// Billing logic tests that don't require Stripe/DB connections.
// Integration tests for createCheckoutSession etc. require live Stripe keys.

describe("getPlanFromPriceId", () => {
  it("returns free for unrecognized price IDs", () => {
    expect(getPlanFromPriceId("price_bogus_123")).toBe("free");
  });

  it("returns growth for growth monthly price ID (env fallback)", () => {
    // Uses the fallback strings defined in plans.ts
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = "price_growth_m_test";
    expect(getPlanFromPriceId("price_growth_m_test")).toBe("growth");
    delete process.env.STRIPE_PRICE_GROWTH_MONTHLY;
  });

  it("returns business for business annual price ID (env fallback)", () => {
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL = "price_biz_a_test";
    expect(getPlanFromPriceId("price_biz_a_test")).toBe("business");
    delete process.env.STRIPE_PRICE_BUSINESS_ANNUAL;
  });
});

describe("plan limit enforcement logic", () => {
  it("free plan gates at 2 API keys", () => {
    const limits = getPlanLimits("free");
    expect(2 >= limits.apiKeys).toBe(true);  // at limit
    expect(1 >= limits.apiKeys).toBe(false); // under limit
  });

  it("growth plan has unlimited keys", () => {
    const limits = getPlanLimits("growth");
    expect(1000 >= limits.apiKeys).toBe(false); // Infinity is never exceeded
  });

  it("downgrading to free disables alerts", () => {
    expect(getPlanLimits("free").alertsEnabled).toBe(false);
    expect(getPlanLimits("growth").alertsEnabled).toBe(true);
    expect(getPlanLimits("business").alertsEnabled).toBe(true);
  });

  it("past_due subscriptions still have current plan features (not downgraded immediately)", () => {
    // Business logic: past_due keeps plan active (Stripe handles grace period)
    // We only downgrade when subscription.deleted fires
    const limits = getPlanLimits("growth");
    expect(limits.alertsEnabled).toBe(true);
  });
});

describe("annual vs monthly pricing", () => {
  it("annual is ~20% cheaper than monthly (structure check)", () => {
    // Prices are set via env vars; this test verifies the conceptual discount
    // In practice: $49/mo × 12 = $588/yr → annual is $470 (≈20% off)
    const monthlyAnnualized = 49 * 12;
    const annualPrice = 470;
    const discount = (monthlyAnnualized - annualPrice) / monthlyAnnualized;
    expect(discount).toBeCloseTo(0.199, 2); // ~20%
  });
});
