/**
 * Clerk webhook handler.
 *
 * Events handled:
 *   organization.created         → create organizations row + generate DEK
 *   organization.updated         → sync name/slug
 *   organizationMembership.created → upsert org_members row
 *   organizationMembership.deleted → mark member deactivated
 *
 * Verified with svix (Clerk's webhook library).
 * This route MUST be public (no Clerk middleware auth check).
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db, schema } from "@/lib/db";
import { generateDEK, encryptDEK } from "@/lib/crypto";
import { eq, and } from "drizzle-orm";

type ClerkWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

function verifyWebhook(req: NextRequest, body: string): ClerkWebhookEvent {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new Error("CLERK_WEBHOOK_SECRET not set");

  const wh = new Webhook(secret);
  return wh.verify(body, {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  }) as ClerkWebhookEvent;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  let event: ClerkWebhookEvent;

  try {
    event = verifyWebhook(req, body);
  } catch (err) {
    console.error("[clerk-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "organization.created": {
        const org = event.data as {
          id: string;
          name: string;
          slug: string;
          created_by: string;
        };

        // Generate a DEK for this org and encrypt it with the master KEK
        const dek = generateDEK();
        const encryptedDek = encryptDEK(dek);

        // Upsert (handle race condition where membership fires first)
        await db.insert(schema.organizations).values({
          id: org.id,
          name: org.name,
          slug: org.slug ?? org.id,
          encryptedDek,
          plan: "free",
        }).onConflictDoNothing();

        console.log(`[clerk-webhook] org created: ${org.id} (${org.name})`);
        break;
      }

      case "organization.updated": {
        const org = event.data as { id: string; name: string; slug: string };
        await db.update(schema.organizations)
          .set({ name: org.name, slug: org.slug ?? org.id, updatedAt: new Date() })
          .where(eq(schema.organizations.id, org.id));
        break;
      }

      case "organizationMembership.created": {
        const membership = event.data as {
          organization: { id: string };
          public_user_data: { user_id: string; first_name?: string; last_name?: string; identifier: string };
          role: string;
          created_at: number;
        };

        const orgId = membership.organization.id;
        const clerkUserId = membership.public_user_data.user_id;
        const email = membership.public_user_data.identifier;
        const fullName = [
          membership.public_user_data.first_name,
          membership.public_user_data.last_name,
        ].filter(Boolean).join(" ") || null;

        // Map Clerk roles to app roles
        const role = membership.role === "org:admin" ? "admin" : "viewer";

        // Ensure org row exists (race condition: membership may fire before org.created)
        const orgExists = await db.query.organizations.findFirst({
          where: eq(schema.organizations.id, orgId),
          columns: { id: true },
        });

        if (!orgExists) {
          // Create a placeholder org row — org.created webhook will fill it in
          const dek = generateDEK();
          const encryptedDek = encryptDEK(dek);
          await db.insert(schema.organizations).values({
            id: orgId,
            name: orgId,
            slug: orgId,
            encryptedDek,
            plan: "free",
          }).onConflictDoNothing();
        }

        await db.insert(schema.orgMembers).values({
          orgId,
          clerkUserId,
          email,
          fullName,
          role,
        }).onConflictDoUpdate({
          target: [schema.orgMembers.orgId, schema.orgMembers.clerkUserId],
          set: { email, fullName, role, status: "active" },
        });

        // First member becomes owner
        const memberCount = await db.query.orgMembers.findMany({
          where: eq(schema.orgMembers.orgId, orgId),
          columns: { id: true },
        });

        if (memberCount.length === 1) {
          await db.update(schema.orgMembers)
            .set({ role: "owner" })
            .where(and(
              eq(schema.orgMembers.orgId, orgId),
              eq(schema.orgMembers.clerkUserId, clerkUserId)
            ));
        }

        console.log(`[clerk-webhook] member joined: ${clerkUserId} → ${orgId} as ${role}`);
        break;
      }

      case "organizationMembership.deleted": {
        const membership = event.data as {
          organization: { id: string };
          public_user_data: { user_id: string };
        };

        await db.update(schema.orgMembers)
          .set({ status: "deactivated" })
          .where(and(
            eq(schema.orgMembers.orgId, membership.organization.id),
            eq(schema.orgMembers.clerkUserId, membership.public_user_data.user_id)
          ));
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[clerk-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
