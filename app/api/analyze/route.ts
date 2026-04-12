import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SpendSummary, Recommendation } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI infrastructure cost optimization expert with deep knowledge of OpenAI model pricing, capabilities, and use-case fit.

Analyze the provided JSON usage data and return a JSON array of actionable recommendations.

Each recommendation object must have EXACTLY these fields:
- category: one of "cost_reduction" | "model_migration" | "overkill" | "reporting" | "anomaly"
- finding: 1-3 sentences describing the specific observed pattern with concrete numbers from the data
- impact: "High" | "Medium" | "Low"
- action: a specific, concrete step — name the exact model to switch to, the exact API key to investigate, etc.
- effort: "Low" | "Medium" | "High"
- savings_estimate: concrete estimate like "~$40/month", "20-35%", or "Unknown"

Key analysis areas — address ALL that are relevant:

**Overkill detection** (category: "overkill"):
- Flag any frontier model (gpt-4o, gpt-4.1, gpt-5.x series, o1, o3) where avg_total_tokens_per_req < 800 AND avg_output_tokens < 150. These are strong signals of simple tasks using expensive models.
- Flag high input/output ratio (> 15:1) — lots of context being sent for little output suggests prompts or RAG retrieval can be trimmed.
- Flag models with avg_output_tokens < 30 — single-sentence or classification tasks that don't need frontier reasoning.
- For each overkill case, name the specific cheaper alternative: gpt-4o → gpt-4o-mini, gpt-4.1 → gpt-4.1-mini, o1/o3 → gpt-4o for most tasks.

**Model migration** (category: "model_migration"):
- If a key spends most of its budget on one model, assess whether the task complexity justifies it.
- Compare cost-per-request across models doing similar token volumes — flag outliers.
- Note if embedding calls are on a non-optimized model.

**Cost reduction** (category: "cost_reduction"):
- High request count with low token counts per request = batching opportunity (reduce per-request overhead).
- Sudden weekly cost spikes (> 2x week-over-week) = likely runaway loop or missing rate limit.
- Any key with > 50% of total spend = single point of risk and optimization target.

**Anomaly** (category: "anomaly"):
- Flag week-over-week cost changes > 100% or drops > 50%.
- Flag any model with cost_per_1k_output dramatically above expected pricing (signals misconfiguration or unexpectedly long outputs).

**Reporting** (category: "reporting"):
- Note any gap in attribution (api_key_id = null / "Org (unattributed)") — this spend can't be chargebacked or optimized.
- Suggest tagging or project separation if multiple very different use cases share one key.

Return 6-12 recommendations sorted by impact DESC, then savings DESC.
Return ONLY a valid JSON array. No markdown, no prose, no explanation outside the JSON.`;

function buildPrompt(summary: SpendSummary): string {
  const byModel = summary.byModel.slice(0, 12).map((m) => ({
    model: m.model,
    cost_usd: +m.costUSD.toFixed(4),
    pct_of_total: +((m.costUSD / summary.totalCostUSD) * 100).toFixed(1),
    requests: m.requests,
    total_input_tokens: m.inputTokens,
    total_output_tokens: m.outputTokens,
    avg_input_tokens_per_req: m.avgInputTokens,
    avg_output_tokens_per_req: m.avgOutputTokens,
    avg_total_tokens_per_req: m.avgTotalTokens,
    input_output_ratio: m.inputOutputRatio,
    cost_per_request_usd: +m.costPerRequest.toFixed(6),
    cost_per_1k_input: +m.costPer1KInput.toFixed(4),
    cost_per_1k_output: +m.costPer1KOutput.toFixed(4),
    overkill_signal: m.overkillSignal,
  }));

  const byKey = summary.byApiKey.slice(0, 8).map((k) => ({
    key_name: k.apiKeyName,
    cost_usd: +k.costUSD.toFixed(4),
    pct_of_total: +((k.costUSD / summary.totalCostUSD) * 100).toFixed(1),
    requests: k.requests,
    top_model: k.byModel[0]?.model ?? "n/a",
    top_model_avg_total_tokens: k.byModel[0]?.avgTotalTokens ?? 0,
    top_model_avg_output_tokens: k.byModel[0]?.avgOutputTokens ?? 0,
    model_count: k.byModel.length,
  }));

  const weeklyTrend = summary.weeklyTrend.map((w, i, arr) => ({
    week: w.weekLabel,
    cost_usd: +w.costUSD.toFixed(2),
    wow_change_pct: i > 0 && arr[i - 1].costUSD > 0
      ? +(((w.costUSD - arr[i - 1].costUSD) / arr[i - 1].costUSD) * 100).toFixed(1)
      : null,
  }));

  // Flag unattributed spend
  const unattributed = summary.byApiKey.find((k) => k.apiKeyId === "org");

  return JSON.stringify({
    window_days: 28,
    total_cost_usd: +summary.totalCostUSD.toFixed(2),
    total_requests: summary.totalRequests,
    total_input_tokens: summary.totalInputTokens,
    total_output_tokens: summary.totalOutputTokens,
    overall_input_output_ratio: summary.totalOutputTokens > 0
      ? +(summary.totalInputTokens / summary.totalOutputTokens).toFixed(1) : 0,
    unattributed_spend_usd: unattributed ? +unattributed.costUSD.toFixed(4) : 0,
    weekly_trend: weeklyTrend,
    by_model: byModel,
    by_api_key: byKey,
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const summary: SpendSummary = await req.json();

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(summary) }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const recommendations: Recommendation[] = JSON.parse(cleaned);
    return NextResponse.json(recommendations);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
