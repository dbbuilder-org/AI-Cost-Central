/**
 * GET /api/cron/key-health
 *
 * Tests all active org API keys and updates lastTestOk / lastTestedAt.
 * Runs every 6 hours via Vercel Cron (see vercel.json).
 * Protected by CRON_SECRET header.
 *
 * Batches 5 concurrent tests to avoid hammering providers.
 * Logs each result without throwing; returns summary JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq, isNull, or, lt, sql } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto";
import { testApiKey } from "@/lib/keyHealth";

const BATCH_SIZE = 5;
const RETEST_AFTER_HOURS = 6;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const results: { keyId: string; provider: string; ok: boolean; latencyMs: number; error?: string }[] = [];

  try {
    // Keys that have never been tested, or haven't been tested in 6h
    const staleThreshold = new Date(Date.now() - RETEST_AFTER_HOURS * 3_600_000);

    const keys = await db.query.apiKeys.findMany({
      where: and(
        eq(schema.apiKeys.isActive, true),
        or(
          isNull(schema.apiKeys.lastTestedAt),
          lt(schema.apiKeys.lastTestedAt, staleThreshold),
        ),
      ),
      columns: {
        id: true,
        orgId: true,
        provider: true,
        encryptedValue: true,
      },
    });

    if (keys.length === 0) {
      return NextResponse.json({ success: true, tested: 0, startedAt, finishedAt: new Date().toISOString() });
    }

    // Fetch all org DEKs in one pass
    const orgIds = [...new Set(keys.map((k) => k.orgId))];
    const orgs = await db.query.organizations.findMany({
      where: sql`${schema.organizations.id} = ANY(ARRAY[${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)}])`,
      columns: { id: true, encryptedDek: true },
    });
    const dekMap = new Map(orgs.map((o) => [o.id, o.encryptedDek ?? null]));

    // Batch test in groups of BATCH_SIZE
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (key) => {
          const dek = dekMap.get(key.orgId);
          if (!dek) {
            results.push({ keyId: key.id, provider: key.provider, ok: false, latencyMs: 0, error: "No DEK" });
            return;
          }

          let plaintext: string;
          try {
            plaintext = decryptApiKey(key.encryptedValue, dek);
          } catch {
            results.push({ keyId: key.id, provider: key.provider, ok: false, latencyMs: 0, error: "Decrypt failed" });
            return;
          }

          const result = await testApiKey(key.provider, plaintext);
          results.push({ keyId: key.id, provider: key.provider, ...result });

          // Update DB regardless of result
          await db
            .update(schema.apiKeys)
            .set({
              lastTestOk: result.ok,
              lastTestedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.apiKeys.id, key.id));
        }),
      );
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      success: true,
      tested: results.length,
      passed,
      failed,
      results: results.map(({ keyId, provider, ok, latencyMs, error }) => ({
        keyId,
        provider,
        ok,
        latencyMs,
        error,
      })),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Key health check failed";
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}

