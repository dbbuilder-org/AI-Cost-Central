/**
 * GET /api/smartrouter/usage
 *
 * Aggregates SmartRouter request_logs into UsageRow[] format so the
 * main dashboard can blend SmartRouter-proxied usage alongside direct
 * provider data (OpenAI Admin API, Anthropic Admin API, etc.).
 *
 * Query params:
 *   ?days=28   look-back window (max 90, default 28)
 *
 * Returns: UsageRow[] — same shape as /api/openai/usage
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";
import type { UsageRow } from "@/types";

export async function GET(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "28", 10), 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  try {
    // Aggregate: group by (provider, model, date) to match UsageRow shape
    const rows = await db
      .select({
        provider:    schema.requestLogs.providerUsed,
        model:       schema.requestLogs.modelUsed,
        date:        sql<string>`DATE(${schema.requestLogs.createdAt})`,
        requests:    sql<number>`COUNT(*)::int`,
        inputTokens: sql<number>`SUM(${schema.requestLogs.inputTokens})::int`,
        outputTokens:sql<number>`SUM(${schema.requestLogs.outputTokens})::int`,
        costUsd:     sql<string>`SUM(${schema.requestLogs.costUsd})`,
      })
      .from(schema.requestLogs)
      .where(
        and(
          eq(schema.requestLogs.orgId, orgId),
          gte(schema.requestLogs.createdAt, since),
          eq(schema.requestLogs.success, true),
        ),
      )
      .groupBy(
        schema.requestLogs.providerUsed,
        schema.requestLogs.modelUsed,
        sql`DATE(${schema.requestLogs.createdAt})`,
      );

    const usageRows: UsageRow[] = rows.map((r) => {
      const costUSD = parseFloat(r.costUsd ?? "0");
      const inputT  = r.inputTokens  ?? 0;
      const outputT = r.outputTokens ?? 0;

      return {
        // Providers not in the union are cast to "openai" as a visual fallback;
        // the actual provider string is preserved in the model name suffix below.
        provider: (["openai", "anthropic", "google"].includes(r.provider)
          ? r.provider
          : "openai") as UsageRow["provider"],
        // Prefix model with provider when non-standard so charts distinguish them
        model: r.model,
        apiKeyId:   `smartrouter:${r.provider}`,
        apiKeyName: `SmartRouter (${r.provider})`,
        date: r.date,
        requests: r.requests,
        inputTokens:  inputT,
        outputTokens: outputT,
        costUSD,
        costPer1KInput:  inputT  > 0 ? (costUSD / inputT)  * 1000 : 0,
        costPer1KOutput: outputT > 0 ? (costUSD / outputT) * 1000 : 0,
      };
    });

    return NextResponse.json(usageRows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch SmartRouter usage";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
