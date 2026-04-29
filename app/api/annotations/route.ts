/**
 * GET  /api/annotations?entityType=usage_date&entityId=2026-04-28
 * POST /api/annotations  { entityType, entityId, content, tags? }
 * DELETE /api/annotations?id=<uuid>
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
    }

    const rows = await db.query.annotations.findMany({
      where: and(
        eq(schema.annotations.orgId, orgId),
        eq(schema.annotations.entityType, entityType),
        eq(schema.annotations.entityId, entityId),
      ),
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    });

    return NextResponse.json({ annotations: rows });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();
    const body = await req.json() as {
      entityType: string;
      entityId: string;
      content: string;
      tags?: string[];
    };

    if (!body.entityType || !body.entityId || !body.content?.trim()) {
      return NextResponse.json({ error: "entityType, entityId, content required" }, { status: 400 });
    }

    const [annotation] = await db.insert(schema.annotations).values({
      orgId,
      entityType: body.entityType,
      entityId: body.entityId,
      content: body.content.trim(),
      tags: body.tags ?? [],
    }).returning();

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(schema.annotations).where(
      and(eq(schema.annotations.id, id), eq(schema.annotations.orgId, orgId)),
    );

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
