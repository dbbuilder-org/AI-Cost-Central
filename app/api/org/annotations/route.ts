import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
    }

    const annotations = await db.query.annotations.findMany({
      where: and(
        eq(schema.annotations.orgId, orgId),
        eq(schema.annotations.entityType, entityType),
        eq(schema.annotations.entityId, entityId)
      ),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });

    return NextResponse.json({ annotations });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();

    const { entityType, entityId, content, tags } = await req.json() as {
      entityType: string;
      entityId: string;
      content: string;
      tags?: string[];
    };

    if (!entityType || !entityId || !content) {
      return NextResponse.json({ error: "entityType, entityId, and content are required" }, { status: 400 });
    }

    const [annotation] = await db.insert(schema.annotations).values({
      orgId,
      entityType,
      entityId,
      content,
      tags: tags ?? [],
    }).returning();

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
