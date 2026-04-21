/**
 * GET    /api/smartrouter/experiments/[experimentId]  — get experiment + results
 * PATCH  /api/smartrouter/experiments/[experimentId]  — update status / conclude
 * DELETE /api/smartrouter/experiments/[experimentId]  — delete
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { experimentId } = await params;

  const [experiment] = await db
    .select()
    .from(schema.routingExperiments)
    .where(and(eq(schema.routingExperiments.id, experimentId), eq(schema.routingExperiments.orgId, orgId)))
    .limit(1);

  if (!experiment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Aggregate results from request_logs
  const results = await db
    .select({
      variant: schema.requestLogs.experimentVariant,
      requests: sql<string>`COUNT(*)`,
      avgLatencyMs: sql<string>`AVG(latency_ms)`,
      avgCostUsd: sql<string>`AVG(cost_usd::numeric)`,
      totalCostUsd: sql<string>`SUM(cost_usd::numeric)`,
      successRate: sql<string>`SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)`,
    })
    .from(schema.requestLogs)
    .where(
      and(
        eq(schema.requestLogs.orgId, orgId),
        eq(schema.requestLogs.experimentId, experimentId),
      )
    )
    .groupBy(schema.requestLogs.experimentVariant);

  const byVariant = Object.fromEntries(
    results.map((r) => [
      r.variant ?? "unknown",
      {
        requests: parseInt(r.requests ?? "0", 10),
        avgLatencyMs: parseFloat(r.avgLatencyMs ?? "0"),
        avgCostUsd: parseFloat(r.avgCostUsd ?? "0"),
        totalCostUsd: parseFloat(r.totalCostUsd ?? "0"),
        successRate: parseFloat(r.successRate ?? "0"),
      },
    ])
  );

  return NextResponse.json({ experiment, results: byVariant });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { experimentId } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const updateFields: Record<string, unknown> = {};
  if (body.status !== undefined) updateFields.status = body.status;
  if (body.winnerVariant !== undefined) updateFields.winnerVariant = body.winnerVariant;
  if (body.name !== undefined) updateFields.name = body.name;
  if (body.splitPct !== undefined) updateFields.splitPct = body.splitPct;

  if (body.status === "concluded") {
    updateFields.concludedAt = new Date();
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(schema.routingExperiments)
    .set(updateFields)
    .where(and(eq(schema.routingExperiments.id, experimentId), eq(schema.routingExperiments.orgId, orgId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ experiment: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { experimentId } = await params;

  const [deleted] = await db
    .delete(schema.routingExperiments)
    .where(and(eq(schema.routingExperiments.id, experimentId), eq(schema.routingExperiments.orgId, orgId)))
    .returning({ id: schema.routingExperiments.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
