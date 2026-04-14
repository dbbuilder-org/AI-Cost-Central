/**
 * Fetches 28 days of usage rows from all three providers and merges them.
 * Used by both the alert cron and the /api/alerts endpoint.
 */

import { transformAnthropic, transformGoogle } from "@/lib/transform";
import type { UsageRow } from "@/types";

// INTERNAL_API_BASE overrides VERCEL_URL — set it to the production alias
// (e.g. https://ai-cost-central.vercel.app) so internal calls bypass Vercel
// deployment-preview SSO protection.
const INTERNAL_BASE =
  process.env.INTERNAL_API_BASE ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function fetchAllUsageRows(): Promise<UsageRow[]> {
  const [oaiRes, anthropicRes, googleRes] = await Promise.allSettled([
    fetch(`${INTERNAL_BASE}/api/openai/usage?days=28`),
    fetch(`${INTERNAL_BASE}/api/anthropic/usage`),
    fetch(`${INTERNAL_BASE}/api/google/usage`),
  ]);

  const all: UsageRow[] = [];

  if (oaiRes.status === "fulfilled" && oaiRes.value.ok) {
    const data = await oaiRes.value.json() as UsageRow[];
    all.push(...data);
  }

  if (anthropicRes.status === "fulfilled" && anthropicRes.value.ok) {
    const data = await anthropicRes.value.json() as { rows: Parameters<typeof transformAnthropic>[0] };
    all.push(...transformAnthropic(data.rows ?? []));
  }

  if (googleRes.status === "fulfilled" && googleRes.value.ok) {
    const data = await googleRes.value.json() as { rows: Parameters<typeof transformGoogle>[0] };
    all.push(...transformGoogle(data.rows ?? []));
  }

  return all;
}
