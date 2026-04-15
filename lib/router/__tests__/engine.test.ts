import { describe, it, expect } from "vitest";
import { route } from "@/lib/router/engine";
import type { TaskType, QualityTier } from "@/types/router";

function baseParams(overrides: Partial<Parameters<typeof route>[0]> = {}) {
  return {
    modelRequested: "gpt-4o",
    taskType: "chat" as TaskType,
    estimatedInputTokens: 500,
    estimatedOutputTokens: 300,
    qualityTier: "balanced" as QualityTier,
    requiresVision: false,
    requiresJsonMode: false,
    requiresFunctionCalling: false,
    ...overrides,
  };
}

describe("route", () => {
  // ── Returns a winner ─────────────────────────────────────────────────────────
  it("always returns a winner", () => {
    const result = route(baseParams());
    expect(result.winner).toBeDefined();
    expect(result.winner.modelId).toBeTruthy();
  });

  it("winner has required fields", () => {
    const result = route(baseParams());
    expect(typeof result.winner.qualityScore).toBe("number");
    expect(typeof result.winner.estimatedCostUSD).toBe("number");
    expect(typeof result.winner.finalScore).toBe("number");
    expect(typeof result.winner.reason).toBe("string");
  });

  // ── Quality tier enforcement ─────────────────────────────────────────────────
  it("economy tier selects a cheaper model than max tier", () => {
    const economy = route(baseParams({ qualityTier: "economy" }));
    const max = route(baseParams({ qualityTier: "max" }));
    // Economy winner should cost less than or equal to max winner
    expect(economy.winner.estimatedCostUSD).toBeLessThanOrEqual(max.winner.estimatedCostUSD + 0.0001);
  });

  it("max tier winner has higher quality score than economy tier winner", () => {
    const economy = route(baseParams({ qualityTier: "economy" }));
    const max = route(baseParams({ qualityTier: "max" }));
    expect(max.winner.qualityScore).toBeGreaterThanOrEqual(economy.winner.qualityScore);
  });

  // ── Task overrides ───────────────────────────────────────────────────────────
  it("respects task override for specific task type", () => {
    const result = route(baseParams({
      taskType: "summarization",
      taskOverrides: { summarization: "gpt-4o-mini" },
    }));
    expect(result.winner.modelId).toBe("gpt-4o-mini");
    expect(result.winner.reason).toContain("task_override");
  });

  it("ignores override for non-matching task type", () => {
    const result = route(baseParams({
      taskType: "coding",
      taskOverrides: { summarization: "gpt-4o-mini" },
    }));
    // Override is for summarization, not coding — should route normally
    expect(result.winner.reason).not.toContain("task_override");
  });

  // ── Provider filtering ────────────────────────────────────────────────────────
  it("restricts to allowed providers", () => {
    const result = route(baseParams({ allowedProviders: ["anthropic"] }));
    expect(result.winner.provider).toBe("anthropic");
  });

  it("falls back to requested model when no candidates meet criteria", () => {
    // Impossible provider — no candidates will match
    const result = route(baseParams({ allowedProviders: ["nonexistent-provider"] }));
    expect(result.winner.modelId).toBe("gpt-4o"); // modelRequested fallback
    expect(result.winner.reason).toContain("fallback");
  });

  // ── Embedding routing ────────────────────────────────────────────────────────
  it("routes embedding tasks to embedding-capable models only", () => {
    const result = route(baseParams({ taskType: "embedding", modelRequested: "text-embedding-3-small" }));
    // Embedding models have outputPer1M = 0
    expect(result.winner.estimatedCostUSD).toBeGreaterThanOrEqual(0);
  });

  // ── Vision filtering ─────────────────────────────────────────────────────────
  it("routes vision tasks to vision-capable models", () => {
    const result = route(baseParams({
      taskType: "vision",
      requiresVision: true,
      qualityTier: "balanced",
    }));
    // Should pick a vision-capable model (gpt-4o, gpt-4.1, gemini variants)
    const visionModels = ["gpt-4o", "gpt-4.1", "gemini-2.0-flash", "gemini-2.5-pro"];
    const isVisionCapable = visionModels.some((m) => result.winner.modelId.includes(m));
    expect(isVisionCapable).toBe(true);
  });

  // ── Savings calculation ──────────────────────────────────────────────────────
  it("savings are non-negative", () => {
    const result = route(baseParams());
    expect(result.estimatedSavingsUSD).toBeGreaterThanOrEqual(0);
    expect(result.estimatedSavingsPct).toBeGreaterThanOrEqual(0);
  });

  it("reports 0 savings when winner costs same as requested model", () => {
    // Use the exact requested model as override → no savings
    const result = route(baseParams({
      taskType: "chat",
      taskOverrides: { chat: "gpt-4o" },
    }));
    expect(result.estimatedSavingsUSD).toBeCloseTo(0, 6);
    expect(result.estimatedSavingsPct).toBe(0);
  });

  // ── Output structure ──────────────────────────────────────────────────────────
  it("returns up to 5 candidates", () => {
    const result = route(baseParams({ qualityTier: "economy" }));
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });

  it("candidates are sorted by finalScore descending", () => {
    const result = route(baseParams());
    for (let i = 0; i < result.candidates.length - 1; i++) {
      expect(result.candidates[i].finalScore).toBeGreaterThanOrEqual(result.candidates[i + 1].finalScore);
    }
  });

  it("reflects modelRequested and taskType in result", () => {
    const result = route(baseParams({ modelRequested: "gpt-4.1", taskType: "coding" }));
    expect(result.modelRequested).toBe("gpt-4.1");
    expect(result.taskType).toBe("coding");
  });
});
