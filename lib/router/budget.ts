/**
 * Budget enforcement for SmartRouter.
 *
 * Checks whether a project has exceeded its daily or monthly spend ceiling
 * by querying request_logs. Called before routing — result determines
 * whether to block (return 429) or downgrade to economy tier.
 *
 * Non-blocking: if the DB query fails, budget check is skipped (fail-open).
 */
import { db, schema } from "@/lib/db";
import { eq, gte, and, sql } from "drizzle-orm";
import type { ProjectRoutingConfig } from "@/lib/db/schema";
import type { QualityTier } from "@/types/router";

export type BudgetStatus =
  | { exceeded: false }
  | { exceeded: true; action: "block" | "downgrade"; reason: string };

export async function checkBudget(
  orgId: string,
  projectId: string,
  config: ProjectRoutingConfig,
): Promise<BudgetStatus> {
  const hasDailyLimit = typeof config.dailyBudgetUsd === "number" && config.dailyBudgetUsd > 0;
  const hasMonthlyLimit = typeof config.monthlyBudgetUsd === "number" && config.monthlyBudgetUsd > 0;
  if (!hasDailyLimit && !hasMonthlyLimit) return { exceeded: false };

  const action = config.budgetAction ?? "downgrade";

  try {
    if (hasDailyLimit) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);

      const [{ total }] = await db
        .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
        .from(schema.requestLogs)
        .where(and(
          eq(schema.requestLogs.orgId, orgId),
          eq(schema.requestLogs.projectId, projectId),
          gte(schema.requestLogs.createdAt, dayStart),
        ));

      const dailySpend = parseFloat(total);
      if (dailySpend >= config.dailyBudgetUsd!) {
        return {
          exceeded: true,
          action,
          reason: `Daily budget of $${config.dailyBudgetUsd} exceeded (spent $${dailySpend.toFixed(4)})`,
        };
      }
    }

    if (hasMonthlyLimit) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [{ total }] = await db
        .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
        .from(schema.requestLogs)
        .where(and(
          eq(schema.requestLogs.orgId, orgId),
          eq(schema.requestLogs.projectId, projectId),
          gte(schema.requestLogs.createdAt, monthStart),
        ));

      const monthlySpend = parseFloat(total);
      if (monthlySpend >= config.monthlyBudgetUsd!) {
        return {
          exceeded: true,
          action,
          reason: `Monthly budget of $${config.monthlyBudgetUsd} exceeded (spent $${monthlySpend.toFixed(4)})`,
        };
      }
    }
  } catch (err) {
    // Fail-open: never block a request because of a budget DB error
    console.warn("[SmartRouter] budget check failed, skipping:", err instanceof Error ? err.message : err);
  }

  return { exceeded: false };
}

/**
 * Returns the effective quality tier after applying budget policy.
 * If the budget is exceeded and action=downgrade, forces economy tier.
 */
export function effectiveTier(
  requested: QualityTier,
  budget: BudgetStatus,
): QualityTier {
  if (budget.exceeded && budget.action === "downgrade") return "economy";
  return requested;
}
