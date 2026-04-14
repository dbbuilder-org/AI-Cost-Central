import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const { orgId } = await requireAuth();

    const projects = await db.query.projects.findMany({
      where: eq(schema.projects.orgId, orgId),
      orderBy: (p, { asc }) => [asc(p.name)],
    });

    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const { name, description, tags, budgetUsd, color, divisionId } = await req.json() as {
      name: string;
      description?: string;
      tags?: string[];
      budgetUsd?: number;
      color?: string;
      divisionId?: string;
    };

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const [project] = await db.insert(schema.projects).values({
      orgId,
      name,
      description,
      tags: tags ?? [],
      budgetUsd: budgetUsd?.toString(),
      color,
      divisionId,
    }).returning();

    await audit(orgId, null, "project.created", "project", project.id, { name });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/projects]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
