/**
 * Latency stats for routing engine (Phase 5).
 *
 * Aggregates p50/p95 latency per (provider, model) from the last 7 days
 * of request_logs. Used to bias routing decisions toward lower-latency providers
 * when latencyWeight > 0 in the project config.
 *
 * Results are cached in-process for 5 minutes to avoid repeated aggregation
 * on a hot path.
 */
import { db, schema } from "@/lib/db";
import { and, gte, eq, sql } from "drizzle-orm";

export interface LatencyStats {
  provider: string;
  modelId: string;
  p50Ms: number;
  p95Ms: number;
  sampleCount: number;
}

// In-process cache — lightweight, per-instance (acceptable for Vercel serverless)
let latencyCache: LatencyStats[] | null = null;
let latencyCacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getLatencyStats(orgId: string): Promise<LatencyStats[]> {
  const now = Date.now();
  if (latencyCache && now < latencyCacheExpiry) return latencyCache;

  try {
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        provider: schema.requestLogs.providerUsed,
        modelId: schema.requestLogs.modelUsed,
        p50: sql<string>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)`,
        p95: sql<string>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(schema.requestLogs)
      .where(
        and(
          eq(schema.requestLogs.orgId, orgId),
          gte(schema.requestLogs.createdAt, since),
          eq(schema.requestLogs.success, true),
        )
      )
      .groupBy(schema.requestLogs.providerUsed, schema.requestLogs.modelUsed);

    latencyCache = rows.map((r) => ({
      provider: r.provider,
      modelId: r.modelId,
      p50Ms: parseFloat(r.p50 ?? "0"),
      p95Ms: parseFloat(r.p95 ?? "0"),
      sampleCount: parseInt(r.count ?? "0", 10),
    }));
    latencyCacheExpiry = now + CACHE_TTL_MS;
    return latencyCache;
  } catch {
    return []; // fail-open
  }
}

/**
 * Compute a latency penalty score for a (provider, model) pair.
 * Returns a value in [0, 1] where 0 = no penalty and 1 = worst latency.
 * Used to bias routing: finalScore -= latencyWeight * latencyPenalty.
 */
export function latencyPenalty(
  modelId: string,
  provider: string,
  stats: LatencyStats[],
): number {
  const entry = stats.find((s) => s.modelId === modelId && s.provider === provider);
  if (!entry || entry.sampleCount < 10) return 0; // not enough data

  const allP95 = stats.filter((s) => s.sampleCount >= 10).map((s) => s.p95Ms);
  if (allP95.length === 0) return 0;

  const maxP95 = Math.max(...allP95);
  const minP95 = Math.min(...allP95);
  if (maxP95 === minP95) return 0;

  return (entry.p95Ms - minP95) / (maxP95 - minP95); // normalized 0–1
}
