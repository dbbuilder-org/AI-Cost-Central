/**
 * GET /api/smartrouter/decisions
 *
 * Returns paginated SmartRouter routing decisions (request_logs) for the org.
 * Used by the dashboard "Routing Decisions" tab.
 *
 * Query params:
 *   ?limit=50      rows per page (max 200)
 *   ?offset=0      pagination offset
 *   ?days=28       look-back window (max 90)
 *   ?taskType=     filter by task type
 *   ?projectId=    filter by project ID
 *   ?success=true  filter by success/failure
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, gte, and, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const limit  = Math.min(parseInt(p.get("limit")  ?? "50"),  200);
  const offset = Math.max(parseInt(p.get("offset") ?? "0"),   0);
  const days   = Math.min(parseInt(p.get("days")   ?? "28"),  90);
  const taskTypeFilter  = p.get("taskType")  ?? null;
  const projectIdFilter = p.get("projectId") ?? null;
  const successFilter   = p.get("success")   ?? null;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  // Build conditions
  const conditions = [
    eq(schema.requestLogs.orgId, orgId),
    gte(schema.requestLogs.createdAt, since),
    ...(taskTypeFilter  ? [eq(schema.requestLogs.taskType,   taskTypeFilter)]  : []),
    ...(projectIdFilter ? [eq(schema.requestLogs.projectId,  projectIdFilter)] : []),
    ...(successFilter !== null
      ? [eq(schema.requestLogs.success, successFilter === "true")]
      : []),
  ];

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(schema.requestLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.requestLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<string>`COUNT(*)` })
      .from(schema.requestLogs)
      .where(and(...conditions)),
  ]);

  const total = parseInt(count);

  return NextResponse.json({
    decisions: rows.map((r) => ({
      id:             r.id,
      createdAt:      r.createdAt.toISOString(),
      projectId:      r.projectId,
      modelRequested: r.modelRequested,
      modelUsed:      r.modelUsed,
      providerUsed:   r.providerUsed,
      taskType:       r.taskType,
      inputTokens:    r.inputTokens,
      outputTokens:   r.outputTokens,
      costUsd:        parseFloat(r.costUsd as string),
      savingsUsd:     parseFloat(r.savingsUsd as string),
      latencyMs:      r.latencyMs,
      success:        r.success,
      errorCode:      r.errorCode,
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
    days,
  });
}
