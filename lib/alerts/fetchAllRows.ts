/**
 * Fetches 28 days of usage rows from all three providers and merges them.
 * Used by the alert cron, brief crns, and the /api/alerts endpoint.
 *
 * Multi-tenant: iterates all orgs that have at least one active key.
 * Uses an internal cron-secret bypass so provider routes skip Clerk auth.
 */

import { transformAnthropic, transformGoogle } from "@/lib/transform";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { UsageRow } from "@/types";

const INTERNAL_BASE =
  process.env.INTERNAL_API_BASE ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

async function getOrgsWithActiveKeys(): Promise<string[]> {
  const keys = await db.query.apiKeys.findMany({
    where: and(eq(schema.apiKeys.isActive, true)),
    columns: { orgId: true },
  });
  return [...new Set(keys.map((k) => k.orgId))];
}

async function fetchRowsForOrg(orgId: string): Promise<UsageRow[]> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return [];

  const headers: Record<string, string> = {
    "x-cron-secret": cronSecret,
    "x-org-id": orgId,
  };

  const [oaiRes, anthropicRes, googleRes] = await Promise.allSettled([
    fetch(`${INTERNAL_BASE}/api/openai/usage?days=28`, { headers }),
    fetch(`${INTERNAL_BASE}/api/anthropic/usage`, { headers }),
    fetch(`${INTERNAL_BASE}/api/google/usage`, { headers }),
  ]);

  const rows: UsageRow[] = [];

  if (oaiRes.status === "fulfilled" && oaiRes.value.ok) {
    const data = await oaiRes.value.json() as UsageRow[];
    rows.push(...data);
  }

  if (anthropicRes.status === "fulfilled" && anthropicRes.value.ok) {
    const data = await anthropicRes.value.json() as { rows: Parameters<typeof transformAnthropic>[0] };
    rows.push(...transformAnthropic(data.rows ?? []));
  }

  if (googleRes.status === "fulfilled" && googleRes.value.ok) {
    const data = await googleRes.value.json() as { rows: Parameters<typeof transformGoogle>[0] };
    rows.push(...transformGoogle(data.rows ?? []));
  }

  return rows;
}

export async function fetchAllUsageRows(): Promise<UsageRow[]> {
  const orgIds = await getOrgsWithActiveKeys();
  if (orgIds.length === 0) return [];

  const perOrg = await Promise.all(orgIds.map((id) => fetchRowsForOrg(id).catch(() => [] as UsageRow[])));
  return perOrg.flat();
}
