/**
 * Stripe billing helpers.
 * All functions are server-only — never call from Client Components.
 */

import { getStripe } from "@/lib/stripe";
import { getPlanFromPriceId } from "@/lib/plans";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function createCheckoutSession({
  orgId,
  priceId,
  successUrl,
  cancelUrl,
}: {
  orgId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();

  // Get or create Stripe customer for this org
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { stripeCustomerId: true, name: true },
  });

  let customerId = org?.stripeCustomerId ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org?.name,
      metadata: { orgId },
    });
    customerId = customer.id;
    await db.update(schema.organizations)
      .set({ stripeCustomerId: customerId })
      .where(eq(schema.organizations.id, orgId));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orgId },
    subscription_data: {
      metadata: { orgId },
    },
    allow_promotion_codes: true,
  });

  return session.url!;
}

export async function createPortalSession({
  orgId,
  returnUrl,
}: {
  orgId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripe();

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { stripeCustomerId: true },
  });

  if (!org?.stripeCustomerId) {
    throw new Error("No Stripe customer found for this org");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

/** Sync subscription state to the organizations table from a Stripe subscription object. */
export async function syncSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata.orgId;
  if (!orgId) {
    console.error("[billing] subscription missing orgId metadata:", subscriptionId);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? getPlanFromPriceId(priceId) : "free";

  await db.update(schema.organizations)
    .set({
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: subscription.status,
      plan,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, orgId));
}
