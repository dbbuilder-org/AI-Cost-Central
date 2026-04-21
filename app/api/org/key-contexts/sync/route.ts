/**
 * POST /api/org/key-contexts/sync
 *
 * Fetches the last 14 days of usage from provider admin APIs,
 * returns all unique API keys with their spend and annotation status.
 * Slow (~10s) — called client-side with a loading state, not on page load.
 *
 * Requires admin role.
 */

import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { fetchAdminUsageRows } from "@/lib/adminUsage";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const maxDuration = 30;

export async function POST() {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const [rows, contexts] = await Promise.all([
      fetchAdminUsageRows(14),
      db.select().from(schema.keyContexts).where(eq(schema.keyContexts.orgId, orgId)),
    ]);

    // Aggregate unique keys with total spend
    const keyMap = new Map<string, {
      providerKeyId: string;
      provider: string;
      displayName: string;
      totalCostUSD: number;
      lastSeen: string;
    }>();

    for (const row of rows) {
      const existing = keyMap.get(row.apiKeyId);
      if (!existing) {
        keyMap.set(row.apiKeyId, {
          providerKeyId: row.apiKeyId,
          provider: row.provider,
          displayName: row.apiKeyName,
          totalCostUSD: row.costUSD,
          lastSeen: row.date,
        });
      } else {
        existing.totalCostUSD += row.costUSD;
        if (row.date > existing.lastSeen) existing.lastSeen = row.date;
      }
    }

    const contextByKeyId = new Map(contexts.map((c) => [c.providerKeyId, c]));

    const keys = [...keyMap.values()]
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .map((k) => ({
        ...k,
        context: contextByKeyId.get(k.providerKeyId) ?? null,
      }));

    return NextResponse.json({ keys, rowCount: rows.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
