/**
 * GET  /api/org/key-contexts/[keyId]  — fetch a single key context + its documents
 * PUT  /api/org/key-contexts/[keyId]  — upsert context (purpose, displayName, githubRepos)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

// GET
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  try {
    const { orgId } = await requireAuth();
    const { keyId } = await params;

    const [context, documents] = await Promise.all([
      db.query.keyContexts.findFirst({
        where: and(
          eq(schema.keyContexts.orgId, orgId),
          eq(schema.keyContexts.providerKeyId, keyId)
        ),
      }),
      db.select().from(schema.keyDocuments).where(
        and(
          eq(schema.keyDocuments.orgId, orgId),
          eq(schema.keyDocuments.providerKeyId, keyId)
        )
      ),
    ]);

    return NextResponse.json({ context: context ?? null, documents });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — upsert (insert or update on conflict)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { keyId } = await params;

    const body = await req.json() as {
      provider?: string;
      displayName?: string;
      purpose?: string;
      githubRepos?: string[];
    };

    const { provider = "openai", displayName, purpose, githubRepos = [] } = body;

    // Validate GitHub repo URLs
    const validRepos = (githubRepos ?? []).filter(
      (r) => typeof r === "string" && r.trim().length > 0
    );

    const [upserted] = await db
      .insert(schema.keyContexts)
      .values({
        orgId,
        providerKeyId: keyId,
        provider,
        displayName: displayName ?? null,
        purpose: purpose ?? null,
        githubRepos: validRepos,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.keyContexts.orgId, schema.keyContexts.providerKeyId],
        set: {
          displayName: displayName ?? null,
          purpose: purpose ?? null,
          githubRepos: validRepos,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({ context: upserted });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
