import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ projectId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { projectId } = await params;

    const body = await req.json() as {
      name?: string;
      description?: string;
      tags?: string[];
      budgetUsd?: number | null;
      color?: string | null;
      divisionId?: string | null;
    };

    await db.update(schema.projects)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.budgetUsd !== undefined && { budgetUsd: body.budgetUsd?.toString() ?? null }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.divisionId !== undefined && { divisionId: body.divisionId }),
      })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)));

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
    const { projectId } = await params;

    await db.delete(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)));

    await audit(orgId, null, "project.deleted", "project", projectId, {});

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
