/**
 * GET  /api/org/projects/[projectId]/routing — fetch this project's routing config
 * PUT  /api/org/projects/[projectId]/routing — replace routing config (admin+)
 *
 * The routing config controls how SmartRouter handles requests for this project:
 *   qualityTier        economy|balanced|quality|max (default: balanced)
 *   autoRoute          enable smart routing (default: true)
 *   allowedProviders   limit to specific providers (default: all)
 *   taskOverrides      pin a task type to a specific model
 *   dailyBudgetUsd     daily spend ceiling for this project (null = no limit)
 *   monthlyBudgetUsd   monthly spend ceiling (null = no limit)
 *   budgetAction       "block" (429) or "downgrade" (economy tier) when budget hit
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ProjectRoutingConfig } from "@/lib/db/schema";
import type { QualityTier, TaskType, ProviderName } from "@/types/router";

type Params = { params: Promise<{ projectId: string }> };

const VALID_TIERS = new Set<QualityTier>(["economy", "balanced", "quality", "max"]);
const VALID_PROVIDERS = new Set<ProviderName>(["openai", "anthropic", "google", "groq", "mistral"]);
const VALID_TASK_TYPES = new Set<TaskType>([
  "chat", "coding", "reasoning", "extraction", "classification",
  "summarization", "generation", "embedding", "vision",
]);

function validateConfig(body: unknown): { config: ProjectRoutingConfig; error?: never } | { error: string; config?: never } {
  if (typeof body !== "object" || body === null) return { error: "Body must be an object" };
  const b = body as Record<string, unknown>;

  if (b.qualityTier !== undefined && !VALID_TIERS.has(b.qualityTier as QualityTier)) {
    return { error: `qualityTier must be one of: ${[...VALID_TIERS].join(", ")}` };
  }
  if (b.autoRoute !== undefined && typeof b.autoRoute !== "boolean") {
    return { error: "autoRoute must be boolean" };
  }
  if (b.allowedProviders !== undefined) {
    if (!Array.isArray(b.allowedProviders)) return { error: "allowedProviders must be an array" };
    for (const p of b.allowedProviders as unknown[]) {
      if (!VALID_PROVIDERS.has(p as ProviderName)) return { error: `Unknown provider: ${p}` };
    }
  }
  if (b.taskOverrides !== undefined) {
    if (typeof b.taskOverrides !== "object" || b.taskOverrides === null) {
      return { error: "taskOverrides must be an object" };
    }
    for (const [k, v] of Object.entries(b.taskOverrides as Record<string, unknown>)) {
      if (!VALID_TASK_TYPES.has(k as TaskType)) return { error: `Unknown task type: ${k}` };
      if (typeof v !== "string") return { error: `taskOverrides.${k} must be a string (model ID)` };
    }
  }
  if (b.dailyBudgetUsd !== undefined && b.dailyBudgetUsd !== null && typeof b.dailyBudgetUsd !== "number") {
    return { error: "dailyBudgetUsd must be a number or null" };
  }
  if (b.monthlyBudgetUsd !== undefined && b.monthlyBudgetUsd !== null && typeof b.monthlyBudgetUsd !== "number") {
    return { error: "monthlyBudgetUsd must be a number or null" };
  }
  if (b.budgetAction !== undefined && !["block", "downgrade"].includes(b.budgetAction as string)) {
    return { error: "budgetAction must be 'block' or 'downgrade'" };
  }

  const config: ProjectRoutingConfig = {};
  if (b.qualityTier !== undefined) config.qualityTier = b.qualityTier as QualityTier;
  if (b.autoRoute !== undefined) config.autoRoute = b.autoRoute as boolean;
  if (b.allowedProviders !== undefined) config.allowedProviders = b.allowedProviders as ProviderName[];
  if (b.taskOverrides !== undefined) config.taskOverrides = b.taskOverrides as Partial<Record<TaskType, string>>;
  if (b.dailyBudgetUsd !== undefined) config.dailyBudgetUsd = b.dailyBudgetUsd as number | null;
  if (b.monthlyBudgetUsd !== undefined) config.monthlyBudgetUsd = b.monthlyBudgetUsd as number | null;
  if (b.budgetAction !== undefined) config.budgetAction = b.budgetAction as "block" | "downgrade";

  return { config };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await requireAuth();
    const { projectId } = await params;

    const project = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)),
      columns: { id: true, name: true, routingConfig: true },
    });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const config = (project.routingConfig ?? {}) as ProjectRoutingConfig;
    return NextResponse.json({ projectId, projectName: project.name, config });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");
    const { projectId } = await params;

    // Verify project belongs to org
    const project = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)),
      columns: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const body = await req.json();
    const result = validateConfig(body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    await db.update(schema.projects)
      .set({ routingConfig: result.config })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)));

    return NextResponse.json({ projectId, config: result.config });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
