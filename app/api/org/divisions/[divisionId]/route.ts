import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ divisionId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { divisionId } = await params;

    const body = await req.json() as {
      name?: string;
      description?: string;
      budgetUsd?: number | null;
      parentId?: string | null;
    };

    await db.update(schema.divisions)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.budgetUsd !== undefined && { budgetUsd: body.budgetUsd?.toString() ?? null }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
      })
      .where(and(eq(schema.divisions.id, divisionId), eq(schema.divisions.orgId, orgId)));

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
    const { divisionId } = await params;

    await db.delete(schema.divisions)
      .where(and(eq(schema.divisions.id, divisionId), eq(schema.divisions.orgId, orgId)));

    await audit(orgId, null, "division.deleted", "division", divisionId, {});

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
