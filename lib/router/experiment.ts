/**
 * A/B routing experiments (Phase 5).
 *
 * Each active experiment has a control model and a treatment model.
 * Traffic is split by splitPct (% to treatment).
 * Assignment is deterministic per (request_id hash) to avoid session bias.
 */
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import type { TaskType } from "@/types/router";

export interface ExperimentAssignment {
  experimentId: string;
  variant: "control" | "treatment";
  modelId: string;
}

/**
 * Load the active experiment for a project and assign the request to a variant.
 * Returns null if no active experiment or on DB error (fail-open).
 */
export async function assignExperiment(
  orgId: string,
  projectId: string,
  taskType: TaskType,
  requestNonce: string,  // unique per request — used for deterministic split
): Promise<ExperimentAssignment | null> {
  if (orgId === "passthrough" || orgId === "default") return null;

  try {
    const experiments = await db
      .select()
      .from(schema.routingExperiments)
      .where(
        and(
          eq(schema.routingExperiments.orgId, orgId),
          eq(schema.routingExperiments.projectId, projectId),
          eq(schema.routingExperiments.status, "active")
        )
      )
      .limit(1);

    const exp = experiments[0];
    if (!exp) return null;

    // Filter by task type if experiment is scoped
    if (exp.taskTypes && exp.taskTypes.length > 0 && !exp.taskTypes.includes(taskType)) {
      return null;
    }

    // Deterministic split: hash(experimentId + nonce) → 0–99
    const hash = simpleHash(`${exp.id}:${requestNonce}`);
    const slot = hash % 100;
    const variant: "control" | "treatment" = slot < exp.splitPct ? "treatment" : "control";
    const modelId = variant === "treatment" ? exp.treatmentModel : exp.controlModel;

    return { experimentId: exp.id, variant, modelId };
  } catch {
    return null; // fail-open
  }
}

/**
 * Simple djb2-style hash that returns a positive integer.
 * Good enough for traffic splitting; not cryptographic.
 */
function simpleHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return Math.abs(h);
}
