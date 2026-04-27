/**
 * AI-written executive narrative for the daily brief email.
 *
 * Calls Claude Sonnet with the full spend picture — yesterday's totals,
 * 7-day trend, top models, top keys, and any anomaly alerts — and returns
 * a 3-paragraph HTML narrative for inclusion at the top of the email.
 *
 * Falls back to an empty string if ANTHROPIC_API_KEY is missing or the
 * call fails; the rest of the email still sends normally.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DailyBriefData } from "./data";
import type { Alert } from "@/types/alerts";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function buildPrompt(data: DailyBriefData, alerts: Alert[]): string {
  const { yesterday, trailing7d, reportDate } = data;

  // 7-day trend
  const trend7d = trailing7d.byDay.length >= 2
    ? (() => {
        const sorted = [...trailing7d.byDay].sort((a, b) => a.date.localeCompare(b.date));
        const first = sorted[0].costUSD;
        const last = sorted[sorted.length - 1].costUSD;
        const pct = first > 0 ? ((last - first) / first) * 100 : 0;
        return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% over the past 7 days`;
      })()
    : "insufficient data for trend";

  // Top 5 keys with their model breakdown
  const topKeys = yesterday.topKeys.slice(0, 5).map((k) => {
    const modelDetail = k.topModels.map(
      (m) => `${m.model} (${m.pct.toFixed(0)}%, $${m.costUSD.toFixed(4)})`
    ).join(", ");
    return `"${k.apiKeyName}" [${k.provider}] — $${k.costUSD.toFixed(4)}, ${k.requests} reqs${modelDetail ? ` | models: ${modelDetail}` : ""}`;
  }).join("\n  ");

  // Model creep alerts (key_model_shift type)
  const modelCreepAlerts = alerts.filter((a) => a.type === "key_model_shift");
  const modelCreepSummary = modelCreepAlerts.length > 0
    ? modelCreepAlerts.map((a) => `  - ${a.message}`).join("\n")
    : "  None detected.";

  // Anomaly summary
  const alertSummary = alerts.length === 0
    ? "No anomalies detected."
    : alerts.map((a) =>
        `[${a.severity.toUpperCase()}] ${a.type} on ${a.subject} (${a.provider}): ${a.message} — ${a.detail}`
      ).join("\n");

  return `You are writing the executive AI analysis section of AICostCentral's daily spend report for ${reportDate}.

SPEND DATA:
- Yesterday total: $${yesterday.totalCostUSD.toFixed(4)}
- 7-day total: $${trailing7d.totalCostUSD.toFixed(4)} (avg $${trailing7d.avgPerDay.toFixed(2)}/day)
- Trend: ${trend7d}

TOP API KEYS (primary unit of analysis — each key's cost breakdown by model):
  ${topKeys || "none"}

MODEL CREEP ALERTS (API keys that started using a new or different model today):
${modelCreepSummary}

ALL ANOMALIES:
${alertSummary}

Write a tight, professional 3-paragraph executive analysis. Use plain prose — no bullet points, no markdown, no headers. Each paragraph should be 3-4 sentences.

Paragraph 1 — SPEND HEALTH: Summarise yesterday's cost in context of the 7-day trend. Is spend accelerating, stable, or declining?

Paragraph 2 — KEY-LEVEL FINDINGS: Analyse spend by API key — not by model in the abstract. For each significant key, name it, state its cost, and describe which model(s) it is calling and whether that model choice is appropriate for its apparent purpose. If any key is using a more expensive model than expected (model creep), flag it by key name and explain the cost impact.

Paragraph 3 — RECOMMENDATIONS: Give 2-3 concrete, actionable recommendations. Reference actual key names, model names, and dollar figures. If model creep is present, recommend whether to revert the model or accept it. Do not give generic advice.

Tone: direct, data-driven, slightly cautious. You are writing for the founder who owns the infrastructure bill.`;
}

/** Convert plain paragraphs (separated by blank lines) to HTML <p> tags. */
function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p style="margin:0 0 14px 0;color:#d1d5db;font-size:13px;line-height:1.7">${p}</p>`)
    .join("");
}

export async function generateDailyNarrative(
  data: DailyBriefData,
  alerts: Alert[]
): Promise<string> {
  const client = getClient();
  if (!client) return "";

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      temperature: 0.3,
      messages: [{ role: "user", content: buildPrompt(data, alerts) }],
    });

    const content = res.content[0];
    if (content.type !== "text") return "";

    const html = paragraphsToHtml(content.text.trim());
    if (!html) return "";

    // Wrap in a styled card block
    return `
<div style="background:#111827;border:1px solid #1f2937;border-left:3px solid #6366f1;border-radius:8px;padding:20px 24px;margin:0 0 24px 0">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
    <span style="font-size:16px">✦</span>
    <span style="color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">AI Analysis</span>
    <span style="color:#374151;font-size:11px">· claude-sonnet-4-6</span>
  </div>
  ${html}
</div>`;
  } catch (err) {
    console.warn("[briefs/narrative] AI narrative generation failed (non-fatal):", err);
    return "";
  }
}
