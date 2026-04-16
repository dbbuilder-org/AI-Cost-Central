/**
 * PATCH /api/org/keys/[keyId]  — update metadata (not the encrypted value)
 * DELETE /api/org/keys/[keyId] — soft-delete (sets is_active = false)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { resolveProviderKey } from "@/lib/server/resolveKey";
import { testApiKey } from "@/lib/keyHealth";

type Params = { params: Promise<{ keyId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { keyId } = await params;

    const body = await req.json() as {
      displayName?: string;
      description?: string;
      tags?: string[];
      budgetUsd?: number | null;
      divisionId?: string | null;
    };

    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.orgId, orgId)),
    });

    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updated = await db.update(schema.apiKeys)
      .set({
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.budgetUsd !== undefined && { budgetUsd: body.budgetUsd?.toString() ?? null }),
        ...(body.divisionId !== undefined && { divisionId: body.divisionId }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.orgId, orgId)))
      .returning({ id: schema.apiKeys.id });

    await audit(orgId, null, "key.updated", "api_key", keyId, body);

    return NextResponse.json({ key: updated[0] });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[PATCH /api/org/keys/[keyId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { keyId } = await params;

    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.orgId, orgId)),
    });

    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    await db.update(schema.apiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.orgId, orgId)));

    await audit(orgId, null, "key.deleted", "api_key", keyId, {
      provider: key.provider,
      displayName: key.displayName,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[DELETE /api/org/keys/[keyId]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/org/keys/[keyId]/test — probe the provider with this key */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await requireAuth();
    const { keyId } = await params;

    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.orgId, orgId)),
      columns: { provider: true, isActive: true },
    });

    if (!key || !key.isActive) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    let testOk = false;
    let testError: string | undefined;

    try {
      const plaintext = await resolveProviderKey(orgId, key.provider as "openai" | "anthropic" | "google");
      const result = await testApiKey(key.provider, plaintext);
      testOk = result.ok;
      testError = result.error;
    } catch (e) {
      testError = e instanceof Error ? e.message : "Unknown error";
    }

    // Update last test result
    await db.update(schema.apiKeys)
      .set({ lastTestedAt: new Date(), lastTestOk: testOk })
      .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.orgId, orgId)));

    return NextResponse.json({ ok: testOk, error: testError });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/keys/[keyId]/test]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
