import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SpendSummary, Recommendation } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI cost optimization expert. You analyze AI API spending data and return actionable recommendations in JSON format.

Return a JSON array of recommendation objects. Each object must have exactly these fields:
- category: one of "cost_reduction", "model_migration", "reporting", "anomaly"
- finding: 1-2 sentences describing the observed issue or opportunity
- impact: one of "High", "Medium", "Low"
- action: specific, concrete step the user should take
- effort: one of "Low", "Medium", "High"
- savings_estimate: e.g. "~$200/month", "10-30%", "Unknown"

Return 5-10 recommendations, prioritized by impact descending.
Return ONLY valid JSON array, no markdown, no prose.`;

function buildPrompt(summary: SpendSummary): string {
  const topModels = summary.byModel.slice(0, 10);
  const topKeys = summary.byApiKey.slice(0, 5).map((k) => ({
    name: k.apiKeyName,
    costUSD: k.costUSD,
    requests: k.requests,
    topModel: k.byModel[0]?.model ?? "n/a",
  }));

  return JSON.stringify({
    window_days: 28,
    total_cost_usd: parseFloat(summary.totalCostUSD.toFixed(2)),
    total_requests: summary.totalRequests,
    total_input_tokens: summary.totalInputTokens,
    total_output_tokens: summary.totalOutputTokens,
    weekly_trend: summary.weeklyTrend.map((w) => ({
      week: w.weekLabel,
      cost_usd: parseFloat(w.costUSD.toFixed(2)),
    })),
    by_model: topModels.map((m) => ({
      model: m.model,
      cost_usd: parseFloat(m.costUSD.toFixed(2)),
      pct_of_total: parseFloat(((m.costUSD / summary.totalCostUSD) * 100).toFixed(1)),
      requests: m.requests,
      input_tokens: m.inputTokens,
      output_tokens: m.outputTokens,
      cost_per_1k_input: parseFloat(m.costPer1KInput.toFixed(4)),
      cost_per_1k_output: parseFloat(m.costPer1KOutput.toFixed(4)),
    })),
    by_api_key: topKeys,
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
      max_tokens: 2000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(summary) }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const recommendations: Recommendation[] = JSON.parse(text);
    return NextResponse.json(recommendations);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
