import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ memberId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { memberId } = await params;

    const { role } = await req.json() as { role: string };
    if (!["owner", "admin", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const member = await db.query.orgMembers.findFirst({
      where: and(eq(schema.orgMembers.id, memberId), eq(schema.orgMembers.orgId, orgId)),
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent changing own role
    if (member.clerkUserId === userId) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    }

    await db.update(schema.orgMembers)
      .set({ role })
      .where(and(eq(schema.orgMembers.id, memberId), eq(schema.orgMembers.orgId, orgId)));

    await audit(orgId, null, "member.role_changed", "org_member", memberId, { role });

    return NextResponse.json({ updated: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[PATCH /api/org/members/[memberId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { memberId } = await params;

    const member = await db.query.orgMembers.findFirst({
      where: and(eq(schema.orgMembers.id, memberId), eq(schema.orgMembers.orgId, orgId)),
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (member.clerkUserId === userId) {
      return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
    }

    if (member.role === "owner") {
      return NextResponse.json({ error: "Cannot deactivate the org owner" }, { status: 400 });
    }

    await db.update(schema.orgMembers)
      .set({ status: "deactivated" })
      .where(and(eq(schema.orgMembers.id, memberId), eq(schema.orgMembers.orgId, orgId)));

    await audit(orgId, null, "member.deactivated", "org_member", memberId, { email: member.email });

    return NextResponse.json({ deactivated: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[DELETE /api/org/members/[memberId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
