/**
 * GET /api/cron/prune-logs
 *
 * Deletes request_logs rows older than the retention window (default: 90 days).
 * Runs nightly at 03:00 UTC via Vercel Cron.
 *
 * Accepts X-Cron-Secret header for authentication (same pattern as other cron routes).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { lt, sql } from "drizzle-orm";

const RETENTION_DAYS = parseInt(process.env.REQUEST_LOG_RETENTION_DAYS ?? "90");

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("cron_secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  const result = await db
    .delete(schema.requestLogs)
    .where(lt(schema.requestLogs.createdAt, cutoff))
    .returning({ id: schema.requestLogs.id });

  const deleted = result.length;

  console.log(`[prune-logs] deleted ${deleted} rows older than ${RETENTION_DAYS} days (cutoff: ${cutoff.toISOString()})`);

  return NextResponse.json({
    deleted,
    cutoff: cutoff.toISOString(),
    retentionDays: RETENTION_DAYS,
    ranAt: new Date().toISOString(),
  });
}
