/**
 * Stripe webhook handler.
 *
 * IMPORTANT:
 * - Must use req.text() NOT req.json() — Stripe signature requires raw body.
 * - Must be in the public routes list in middleware.ts (no Clerk auth).
 * - All events are idempotent: check existing state before writing.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/billing";
import { getPlanFromPriceId } from "@/lib/plans";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          await syncSubscription(session.subscription as string);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata.orgId;
        if (orgId) {
          await db.update(schema.organizations)
            .set({
              plan: "free",
              subscriptionStatus: "canceled",
              stripeSubscriptionId: null,
              stripePriceId: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.organizations.id, orgId));
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = (invoice as Stripe.Invoice & { subscription_details?: { metadata?: { orgId?: string } } })
          .subscription_details?.metadata?.orgId;

        if (orgId) {
          await db.update(schema.organizations)
            .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
            .where(eq(schema.organizations.id, orgId));

          // Notify via email
          const org = await db.query.organizations.findFirst({
            where: eq(schema.organizations.id, orgId),
            columns: { name: true },
          });

          const recipientEmail = process.env.ALERT_EMAIL_TO;
          if (recipientEmail) {
            await sendEmail({
              to: recipientEmail,
              subject: `Payment failed — ${org?.name ?? orgId}`,
              html: `<p>Payment failed for organization <strong>${org?.name ?? orgId}</strong>. Please update your payment method at <a href="${process.env.DASHBOARD_URL ?? "https://aicostcentral.vercel.app"}/billing">billing settings</a>.</p>`,
            }).catch(console.error);
          }
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
