/**
 * PATCH /api/org/webhooks/[webhookId]  — update webhook (url, events, active state, description)
 * DELETE /api/org/webhooks/[webhookId] — delete webhook
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ webhookId: string }> };

const VALID_EVENTS = new Set(["alert.fired", "budget.exceeded", "model.price_changed"]);

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { webhookId } = await params;

    const body = await req.json() as {
      url?: string;
      description?: string;
      events?: string[];
      isActive?: boolean;
    };

    if (body.events) {
      for (const e of body.events) {
        if (!VALID_EVENTS.has(e)) {
          return NextResponse.json({ error: `Unknown event: ${e}` }, { status: 400 });
        }
      }
    }

    if (body.url && process.env.NODE_ENV === "production" && !body.url.startsWith("https://")) {
      return NextResponse.json({ error: "url must use HTTPS" }, { status: 400 });
    }

    const [updated] = await db.update(schema.orgWebhooks)
      .set({
        ...(body.url !== undefined && { url: body.url }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.events !== undefined && { events: body.events }),
        ...(body.isActive !== undefined && { isActive: body.isActive, failureCount: body.isActive ? 0 : undefined }),
      })
      .where(and(eq(schema.orgWebhooks.id, webhookId), eq(schema.orgWebhooks.orgId, orgId)))
      .returning({ id: schema.orgWebhooks.id });

    if (!updated) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

    return NextResponse.json({ updated: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { webhookId } = await params;

    await db.delete(schema.orgWebhooks)
      .where(and(eq(schema.orgWebhooks.id, webhookId), eq(schema.orgWebhooks.orgId, orgId)));

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
