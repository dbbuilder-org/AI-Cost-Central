/**
 * POST /api/org/projects/[projectId]/keys — assign or remove a key from a project
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { projectId } = await params;

    const { apiKeyId, action } = await req.json() as { apiKeyId: string; action: "assign" | "remove" };

    // Verify project belongs to org
    const project = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)),
      columns: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify key belongs to org
    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, apiKeyId), eq(schema.apiKeys.orgId, orgId)),
      columns: { id: true },
    });
    if (!key) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (action === "assign") {
      await db.insert(schema.apiKeyProjects)
        .values({ apiKeyId, projectId })
        .onConflictDoNothing();
    } else {
      await db.delete(schema.apiKeyProjects)
        .where(and(
          eq(schema.apiKeyProjects.apiKeyId, apiKeyId),
          eq(schema.apiKeyProjects.projectId, projectId)
        ));
    }

    return NextResponse.json({ updated: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
