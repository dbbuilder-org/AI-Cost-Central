/**
 * GET  /api/smartrouter/experiments  — list experiments for org
 * POST /api/smartrouter/experiments  — create experiment
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";

const VALID_STATUS = ["active", "paused", "concluded"] as const;

export async function GET(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("projectId") ?? undefined;
  const statusFilter = searchParams.get("status") ?? undefined;

  const conditions = [eq(schema.routingExperiments.orgId, orgId)];
  if (projectId) conditions.push(eq(schema.routingExperiments.projectId, projectId));
  if (statusFilter) conditions.push(eq(schema.routingExperiments.status, statusFilter));

  const experiments = await db
    .select()
    .from(schema.routingExperiments)
    .where(and(...conditions))
    .orderBy(desc(schema.routingExperiments.createdAt))
    .limit(50);

  return NextResponse.json({ experiments });
}

export async function POST(req: NextRequest) {
  let orgId: string;
  try {
    ({ orgId } = await requireAuth());
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, name, description, controlModel, treatmentModel, splitPct, taskTypes } = body as {
    projectId?: string;
    name?: string;
    description?: string;
    controlModel?: string;
    treatmentModel?: string;
    splitPct?: number;
    taskTypes?: string[];
  };

  if (!projectId || !name || !controlModel || !treatmentModel) {
    return NextResponse.json({ error: "projectId, name, controlModel, treatmentModel are required" }, { status: 400 });
  }

  const split = splitPct ?? 50;
  if (split < 1 || split > 99) {
    return NextResponse.json({ error: "splitPct must be 1–99" }, { status: 400 });
  }

  const [experiment] = await db
    .insert(schema.routingExperiments)
    .values({
      orgId,
      projectId,
      name,
      description,
      controlModel,
      treatmentModel,
      splitPct: split,
      taskTypes: taskTypes ?? [],
      status: "active",
    })
    .returning();

  return NextResponse.json({ experiment }, { status: 201 });
}
