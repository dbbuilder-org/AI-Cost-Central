/**
 * GET  /api/org/webhooks  — list org webhooks
 * POST /api/org/webhooks  — create webhook
 *
 * Body for POST:
 *   url         string   required — HTTPS endpoint to deliver to
 *   description string?
 *   events      string[] — ["alert.fired","budget.exceeded","model.price_changed"] (empty = all)
 *   secret      string?  — HMAC signing secret
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const VALID_EVENTS = new Set(["alert.fired", "budget.exceeded", "model.price_changed"]);

export async function GET() {
  try {
    const { orgId } = await requireAuth();
    const hooks = await db.query.orgWebhooks.findMany({
      where: eq(schema.orgWebhooks.orgId, orgId),
      columns: {
        id: true, url: true, description: true, events: true,
        isActive: true, lastDeliveredAt: true, lastStatusCode: true,
        failureCount: true, createdAt: true,
        // Never return the secret
      },
      orderBy: (h, { desc }) => [desc(h.createdAt)],
    });
    return NextResponse.json({ webhooks: hooks });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const body = await req.json() as {
      url: string;
      description?: string;
      events?: string[];
      secret?: string;
    };

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Only allow HTTPS in production
    if (process.env.NODE_ENV === "production" && !body.url.startsWith("https://")) {
      return NextResponse.json({ error: "url must use HTTPS" }, { status: 400 });
    }

    const events = body.events ?? [];
    for (const e of events) {
      if (!VALID_EVENTS.has(e)) {
        return NextResponse.json({ error: `Unknown event: ${e}. Valid: ${[...VALID_EVENTS].join(", ")}` }, { status: 400 });
      }
    }

    // Auto-generate secret if not provided
    const secret = body.secret ?? crypto.randomBytes(32).toString("hex");

    const [hook] = await db.insert(schema.orgWebhooks).values({
      orgId,
      url: body.url,
      description: body.description,
      events,
      secret,
    }).returning();

    return NextResponse.json({ webhook: { ...hook, secret } }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/webhooks]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
