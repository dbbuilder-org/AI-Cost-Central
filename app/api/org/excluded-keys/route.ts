/**
 * GET  /api/org/excluded-keys  — returns the org's excluded provider key IDs
 * POST /api/org/excluded-keys  — replaces the full excluded list
 *
 * Excluded key IDs are stored in org.settings.excludedKeyIds (jsonb).
 * Provider usage routes read this and filter matching rows before returning.
 *
 * Body: { excludedKeyIds: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { settings: true },
  });

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const excludedKeyIds = (settings.excludedKeyIds as string[] | undefined) ?? [];

  return NextResponse.json({ excludedKeyIds });
}

export async function POST(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { excludedKeyIds: unknown };
  try {
    body = await req.json() as { excludedKeyIds: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.excludedKeyIds) || !body.excludedKeyIds.every((k) => typeof k === "string")) {
    return NextResponse.json({ error: "excludedKeyIds must be a string array" }, { status: 400 });
  }

  const excludedKeyIds: string[] = body.excludedKeyIds;

  // Read current settings, merge in the new field (preserve other settings)
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { settings: true },
  });
  const currentSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const updatedSettings = { ...currentSettings, excludedKeyIds };

  await db
    .update(schema.organizations)
    .set({ settings: updatedSettings, updatedAt: new Date() })
    .where(eq(schema.organizations.id, orgId));

  return NextResponse.json({ excludedKeyIds });
}
