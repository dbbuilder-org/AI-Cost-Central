/**
 * GET /api/alerts
 *
 * Returns recent anomaly alerts for the mobile app.
 * Serves from the key_alerts DB table (populated by the daily-digest and
 * anomaly-check crons). Falls back to live detection if the DB is empty.
 *
 * ?days=N  — how many days back to look (default 30)
 */

import { NextRequest, NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Alert } from "@/types/alerts";

export async function GET(req: NextRequest) {
  const days = Math.min(90, Math.max(1, parseInt(
    req.nextUrl.searchParams.get("days") ?? "30", 10
  ) || 30));

  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(schema.keyAlerts)
      .where(gte(schema.keyAlerts.detectedAt, sinceStr))
      .orderBy(schema.keyAlerts.detectedAt);

    const alerts: Alert[] = rows.map((row) => ({
      id: row.id,
      type: row.alertType as Alert["type"],
      severity: row.severity as Alert["severity"],
      provider: row.provider,
      subject: row.subject,
      message: row.message,
      detail: row.detail,
      investigateSteps: (row.investigateSteps as string[]) ?? [],
      value: Number(row.value ?? 0),
      baseline: Number(row.baseline ?? 0),
      changePct: Number(row.changePct ?? 0),
      models: row.models ?? [],
      apiKeyId: row.providerKeyId,
      detectedAt: row.detectedAt,
    }));

    // Sort most recent first
    alerts.sort((a, b) => (b.detectedAt ?? "").localeCompare(a.detectedAt ?? ""));

    return NextResponse.json(alerts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch alerts";
    console.error("[api/alerts]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
