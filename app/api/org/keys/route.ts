/**
 * GET  /api/org/keys  — list org's API keys (metadata only, never plaintext)
 * POST /api/org/keys  — create a new encrypted key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and, count } from "drizzle-orm";
import { encryptApiKey, keyHint } from "@/lib/crypto";
import { getOrgPlanLimits } from "@/lib/plans";

export async function GET() {
  try {
    const { orgId } = await requireAuth();

    const keys = await db.query.apiKeys.findMany({
      where: and(
        eq(schema.apiKeys.orgId, orgId),
        eq(schema.apiKeys.isActive, true)
      ),
      columns: {
        id: true,
        provider: true,
        displayName: true,
        hint: true,
        isActive: true,
        description: true,
        tags: true,
        budgetUsd: true,
        lastTestedAt: true,
        lastTestOk: true,
        createdAt: true,
        // encryptedValue is intentionally excluded
      },
      orderBy: (keys, { desc }) => [desc(keys.createdAt)],
    });

    return NextResponse.json({ keys });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[GET /api/org/keys]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const body = await req.json() as {
      provider: string;
      displayName: string;
      plaintext: string;
      description?: string;
      tags?: string[];
      budgetUsd?: number;
      divisionId?: string;
    };

    const { provider, displayName, plaintext, description, tags, budgetUsd, divisionId } = body;

    if (!provider || !displayName || !plaintext) {
      return NextResponse.json(
        { error: "provider, displayName, and plaintext are required" },
        { status: 400 }
      );
    }

    if (!["openai", "anthropic", "google"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    // Enforce plan limit on number of keys
    const [limits, keyCountResult] = await Promise.all([
      getOrgPlanLimits(orgId),
      db.select({ count: count() }).from(schema.apiKeys).where(
        and(eq(schema.apiKeys.orgId, orgId), eq(schema.apiKeys.isActive, true))
      ),
    ]);

    const keyCount = keyCountResult[0]?.count ?? 0;
    if (keyCount >= limits.apiKeys) {
      return NextResponse.json(
        { error: "API key limit reached for your plan. Upgrade to add more.", code: "LIMIT_API_KEYS" },
        { status: 403 }
      );
    }

    // Get org's DEK for encryption
    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, orgId),
      columns: { encryptedDek: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const encryptedValue = encryptApiKey(plaintext, org.encryptedDek);
    const hint = keyHint(plaintext);

    const [newKey] = await db.insert(schema.apiKeys).values({
      orgId,
      provider,
      displayName,
      encryptedValue,
      hint,
      description,
      tags: tags ?? [],
      budgetUsd: budgetUsd?.toString(),
      divisionId,
    }).returning({
      id: schema.apiKeys.id,
      provider: schema.apiKeys.provider,
      displayName: schema.apiKeys.displayName,
      hint: schema.apiKeys.hint,
      createdAt: schema.apiKeys.createdAt,
    });

    await audit(orgId, null, "key.created", "api_key", newKey.id, {
      provider,
      displayName,
    });

    return NextResponse.json({ key: newKey }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/keys]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
