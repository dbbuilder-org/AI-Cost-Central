/**
 * Routing engine — selects optimal model given task classification + project rules + pricing.
 */
import type { TaskType, QualityTier, RoutingDecision, RoutingCandidate } from "@/types/router";
import { PRICING_CATALOG, QUALITY_SCORES, estimateCost, type PricingEntry } from "./pricing";

// Quality floor per tier (minimum quality score required)
const QUALITY_FLOORS: Record<QualityTier, number> = {
  economy:  70,
  balanced: 80,
  quality:  88,
  max:      94,
};

// Virtual model aliases → quality tier mapping
export const VIRTUAL_MODELS: Record<string, QualityTier> = {
  "smart-cheap":     "economy",
  "smart-balanced":  "balanced",
  "smart-quality":   "quality",
  "smart-max":       "max",
  "smart-coding":    "balanced",   // handled specially
  "smart-reasoning": "quality",
};

interface EngineParams {
  modelRequested: string;
  taskType: TaskType;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  qualityTier: QualityTier;
  allowedProviders?: string[];
  taskOverrides?: Partial<Record<TaskType, string>>;
  requiresVision: boolean;
  requiresJsonMode: boolean;
  requiresFunctionCalling: boolean;
}

function scoreCandidate(
  model: PricingEntry,
  taskType: TaskType,
  tier: QualityTier,
  inputTokens: number,
  outputTokens: number
): RoutingCandidate | null {
  const qualityMap = QUALITY_SCORES[model.modelId] ?? QUALITY_SCORES[Object.keys(QUALITY_SCORES).find((k) => model.modelId.startsWith(k)) ?? ""] ?? null;
  if (!qualityMap) return null;

  const quality = qualityMap[taskType] ?? 70;
  const floor = QUALITY_FLOORS[tier];
  if (quality < floor) return null;

  const cost = estimateCost(model.modelId, inputTokens, outputTokens);
  // Score = quality / (cost * 1000 + 0.01) — higher is better, cost in millicents
  const costEfficiency = quality / (cost * 1000 + 0.01);
  const finalScore = Math.round(costEfficiency * 10) / 10;

  return {
    modelId: model.modelId,
    provider: model.provider as never,
    qualityScore: quality,
    estimatedCostUSD: cost,
    costEfficiencyScore: costEfficiency,
    finalScore,
    reason: `quality=${quality}, cost=$${cost.toFixed(6)}, tier=${tier}`,
  };
}

export function route(params: EngineParams): RoutingDecision {
  const {
    modelRequested, taskType, estimatedInputTokens, estimatedOutputTokens,
    qualityTier, allowedProviders, taskOverrides, requiresVision, requiresJsonMode, requiresFunctionCalling,
  } = params;

  // Check for task-specific override first
  const override = taskOverrides?.[taskType];
  if (override) {
    const model = PRICING_CATALOG.find((m) => m.modelId === override);
    if (model) {
      const cost = estimateCost(model.modelId, estimatedInputTokens, estimatedOutputTokens);
      const requestedCost = estimateCost(modelRequested, estimatedInputTokens, estimatedOutputTokens);
      return {
        winner: {
          modelId: model.modelId, provider: model.provider as never,
          qualityScore: QUALITY_SCORES[model.modelId]?.[taskType] ?? 80,
          estimatedCostUSD: cost, costEfficiencyScore: 0, finalScore: 0,
          reason: `task_override: ${taskType} → ${model.modelId}`,
        },
        candidates: [],
        modelRequested,
        taskType,
        estimatedSavingsUSD: Math.max(0, requestedCost - cost),
        estimatedSavingsPct: requestedCost > 0 ? Math.round(Math.max(0, (requestedCost - cost) / requestedCost) * 100) : 0,
      };
    }
  }

  // Filter and score candidates
  const candidates: RoutingCandidate[] = [];

  for (const model of PRICING_CATALOG) {
    if (allowedProviders && !allowedProviders.includes(model.provider)) continue;
    if (taskType === "embedding" && model.outputPer1M > 0) continue;
    if (taskType !== "embedding" && model.outputPer1M === 0) continue;
    if (requiresVision && !["gpt-4o", "gpt-4.1", "gpt-4o-mini", "gemini-2.0-flash", "gemini-2.5-pro"].some((m) => model.modelId.includes(m))) continue;
    // JSON mode only supported by certain models
    if (requiresJsonMode && !["openai", "google"].includes(model.provider) && !model.modelId.includes("mixtral")) continue;

    const candidate = scoreCandidate(model, taskType, qualityTier, estimatedInputTokens, estimatedOutputTokens);
    if (candidate) candidates.push(candidate);
  }

  // Sort by finalScore descending
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  const winner = candidates[0];
  if (!winner) {
    // Fallback: use requested model
    const cost = estimateCost(modelRequested, estimatedInputTokens, estimatedOutputTokens);
    return {
      winner: { modelId: modelRequested, provider: "openai" as never, qualityScore: 80, estimatedCostUSD: cost, costEfficiencyScore: 0, finalScore: 0, reason: "fallback: no candidates met criteria" },
      candidates: [],
      modelRequested,
      taskType,
      estimatedSavingsUSD: 0,
      estimatedSavingsPct: 0,
    };
  }

  const requestedCost = estimateCost(modelRequested, estimatedInputTokens, estimatedOutputTokens);
  const savings = Math.max(0, requestedCost - winner.estimatedCostUSD);
  const savingsPct = requestedCost > 0 ? Math.round((savings / requestedCost) * 100) : 0;

  return {
    winner,
    candidates: candidates.slice(0, 5),
    modelRequested,
    taskType,
    estimatedSavingsUSD: savings,
    estimatedSavingsPct: savingsPct,
  };
}
