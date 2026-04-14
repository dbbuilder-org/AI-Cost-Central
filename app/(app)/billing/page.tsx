import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getPlanLimits, PLAN_LIMITS } from "@/lib/plans";
import { BillingClient } from "@/components/billing/BillingClient";
import { count } from "drizzle-orm";
import { and } from "drizzle-orm";

export default async function BillingPage() {
  const { orgId } = await requireAuth();

  const [org, memberCount, keyCount] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(schema.organizations.id, orgId),
      columns: {
        plan: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        trialEndsAt: true,
      },
    }),
    db.select({ count: count() }).from(schema.orgMembers).where(
      and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.status, "active"))
    ),
    db.select({ count: count() }).from(schema.apiKeys).where(
      and(eq(schema.apiKeys.orgId, orgId), eq(schema.apiKeys.isActive, true))
    ),
  ]);

  const plan = org?.plan ?? "free";
  const limits = getPlanLimits(plan);

  const usage = {
    members: memberCount[0]?.count ?? 0,
    apiKeys: keyCount[0]?.count ?? 0,
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <p className="text-gray-400 mt-1 text-sm">Manage your subscription and usage limits</p>
        </div>

        <BillingClient
          plan={plan}
          subscriptionStatus={org?.subscriptionStatus ?? "inactive"}
          hasStripeCustomer={!!org?.stripeCustomerId}
          limits={limits}
          usage={usage}
          planPrices={{
            growthMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? "",
            growthAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? "",
            businessMonthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? "",
            businessAnnual: process.env.STRIPE_PRICE_BUSINESS_ANNUAL ?? "",
          }}
        />
      </div>
    </div>
  );
}
