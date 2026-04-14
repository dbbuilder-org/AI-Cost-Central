import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const { orgId } = await requireAuth();

    const members = await db.query.orgMembers.findMany({
      where: eq(schema.orgMembers.orgId, orgId),
      columns: {
        id: true,
        clerkUserId: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        joinedAt: true,
      },
      orderBy: (m, { asc }) => [asc(m.joinedAt)],
    });

    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[GET /api/org/members]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
