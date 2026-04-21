/**
 * GET /api/org/key-contexts
 * Returns all key contexts for the org (annotated keys only).
 * Clients call /api/org/key-contexts/sync separately to discover new keys.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const { orgId } = await requireAuth();

    const contexts = await db
      .select()
      .from(schema.keyContexts)
      .where(eq(schema.keyContexts.orgId, orgId))
      .orderBy(schema.keyContexts.updatedAt);

    return NextResponse.json({ contexts });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
