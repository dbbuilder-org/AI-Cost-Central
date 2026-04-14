/**
 * Plan feature limits — single source of truth.
 * Server-side enforcement is authoritative; UI gating is for UX only.
 */

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export type Plan = "free" | "growth" | "business" | "enterprise";

export interface PlanLimits {
  members: number;
  apiKeys: number;
  divisions: number;
  historyDays: number;
  alertsEnabled: boolean;
  forecastEnabled: boolean;
  apiAccess: boolean;
  aiAnalysisPerDay: number;
  briefsEnabled: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    members: 1,
    apiKeys: 2,
    divisions: 1,
    historyDays: 28,
    alertsEnabled: false,
    forecastEnabled: false,
    apiAccess: false,
    aiAnalysisPerDay: 1,
    briefsEnabled: false,
  },
  growth: {
    members: 10,
    apiKeys: Infinity,
    divisions: 3,
    historyDays: 90,
    alertsEnabled: true,
    forecastEnabled: true,
    apiAccess: false,
    aiAnalysisPerDay: Infinity,
    briefsEnabled: true,
  },
  business: {
    members: Infinity,
    apiKeys: Infinity,
    divisions: Infinity,
    historyDays: 365,
    alertsEnabled: true,
    forecastEnabled: true,
    apiAccess: true,
    aiAnalysisPerDay: Infinity,
    briefsEnabled: true,
  },
  enterprise: {
    members: Infinity,
    apiKeys: Infinity,
    divisions: Infinity,
    historyDays: 730,
    alertsEnabled: true,
    forecastEnabled: true,
    apiAccess: true,
    aiAnalysisPerDay: Infinity,
    briefsEnabled: true,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}

/** Fetch an org's plan from the DB and return its limits. */
export async function getOrgPlanLimits(orgId: string): Promise<PlanLimits> {
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { plan: true },
  });
  return getPlanLimits(org?.plan ?? "free");
}

/** Stripe Price ID → Plan name mapping. Set in env vars. */
export function getPlanFromPriceId(priceId: string): Plan {
  const map: Record<string, Plan> = {
    [process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? "price_growth_monthly"]: "growth",
    [process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? "price_growth_annual"]: "growth",
    [process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? "price_business_monthly"]: "business",
    [process.env.STRIPE_PRICE_BUSINESS_ANNUAL ?? "price_business_annual"]: "business",
  };
  return map[priceId] ?? "free";
}
