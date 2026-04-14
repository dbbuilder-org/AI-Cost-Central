import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const { orgId } = await requireAuth();

    await db.update(schema.organizations)
      .set({ onboarded: true, updatedAt: new Date() })
      .where(eq(schema.organizations.id, orgId));

    return NextResponse.json({ onboarded: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/onboarding/complete]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
