/**
 * AI enrichment layer — takes raw DetectionResults, sends them to
 * Claude Haiku for plain-language explanation and investigation steps.
 *
 * Falls back gracefully if ANTHROPIC_API_KEY is missing or the API fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Alert, DetectionResult } from "@/types/alerts";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function makeId(result: DetectionResult, date: string): string {
  const raw = `${result.type}:${result.provider}:${result.subject}:${date}`;
  // Simple deterministic hash
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function buildFallbackAlert(result: DetectionResult, date: string): Alert {
  const detail = buildFallbackDetail(result);
  return {
    ...result,
    id: makeId(result, date),
    detail,
    investigateSteps: buildFallbackSteps(result),
    detectedAt: date,
  };
}

function buildFallbackDetail(r: DetectionResult): string {
  const model = r.models?.[0] ?? "unknown model";
  switch (r.type) {
    case "cost_spike":
      return `API key "${r.subject}" (${r.provider}) showed a significant cost increase. The daily cost reached $${r.value.toFixed(2)}, which is ${r.changePct.toFixed(0)}% above the $${r.baseline.toFixed(2)} baseline. The primary driver was ${model}. This may indicate a traffic surge, an inefficient prompt, or a new workflow on this key.`;
    case "cost_drop":
      return `API key "${r.subject}" (${r.provider}) spend is notably down to $${r.value.toFixed(2)} vs the $${r.baseline.toFixed(2)} daily baseline. This may reflect an intentional change, reduced usage, or a possible integration issue worth verifying.`;
    case "volume_spike":
      return `API key "${r.subject}" (${r.provider}) received ${r.value.toLocaleString()} requests today — a ${r.changePct.toFixed(0)}% increase over the ${Math.round(r.baseline).toLocaleString()} requests/day baseline. Primary model: ${model}.`;
    case "key_model_shift":
      return r.models && r.models.length > 1
        ? `API key "${r.subject}" (${r.provider}) shifted its primary model from ${r.models[1]} to ${r.models[0]}. This change may explain any associated cost movement — different models have different pricing and performance characteristics.`
        : `API key "${r.subject}" (${r.provider}) used ${model} for the first time today, spending $${r.value.toFixed(4)}. This model was not seen in prior usage history for this key.`;
    case "new_key":
      return `A new API key "${r.subject}" (${r.provider}) was detected with first usage recorded recently. Total spend so far: $${r.value.toFixed(2)}${model !== "unknown model" ? `, primarily via ${model}` : ""}.`;
  }
}

function buildFallbackSteps(r: DetectionResult): string[] {
  const model = r.models?.[0] ?? "the model";
  switch (r.type) {
    case "cost_spike":
    case "volume_spike":
      return [
        `Check which service or codebase uses the API key "${r.subject}" — that project is the source of this spike.`,
        `Review recent deployments or code changes to that project for increases in call frequency, token count, or prompt size.`,
        `Set a daily budget limit on this key in your ${r.provider} console to cap any future runaway spend.`,
      ];
    case "cost_drop":
      return [
        `Check if the spend reduction on "${r.subject}" was intentional — a deployment change, feature flag, or traffic shift could explain it.`,
        `If unexpected, verify the service using this key is still running and making API calls normally.`,
        `Test the integration manually to confirm the key is valid and the endpoint is reachable.`,
      ];
    case "key_model_shift":
      return r.models && r.models.length > 1
        ? [
            `Check git history for the project using "${r.subject}" for any changes to the model parameter (${r.models[1]} → ${r.models[0]}).`,
            `Compare pricing between ${r.models[1]} and ${r.models[0]} to estimate the ongoing cost impact of this switch.`,
            `If unintentional, revert the model setting and investigate who or what made the change.`,
          ]
        : [
            `Find the codebase or service using "${r.subject}" and check for recent commits that introduced ${model}.`,
            `Verify the model name is intentional — AI-generated code sometimes defaults to more expensive models.`,
            `Review ${model} pricing on ${r.provider} to confirm this fits your cost targets for this key.`,
          ];
    case "new_key":
      return [
        `Confirm that "${r.subject}" was created intentionally by a member of your team.`,
        `If unexpected, rotate or revoke the key immediately and audit who has admin access on ${r.provider}.`,
        `Tag the key with its project name in AICostCentral settings so future anomalies are easier to attribute.`,
      ];
  }
}

const SYSTEM_PROMPT = `You are an AI spending analyst helping engineering teams understand unusual patterns in their AI API usage.
All anomalies are reported at the API key level — the subject is always an API key, not a model.
Model information is provided as context to explain why the key's cost or volume changed.
When given anomaly detection results, provide:
1. A clear 2-3 sentence business explanation focused on the API key and what changed about its behavior
2. Exactly 3 specific, actionable investigation steps that start from the API key and lead to the root cause

Keep explanations factual and concise. Focus on practical impact. Never use jargon.
Respond in JSON format.`;

export async function enrichWithAI(
  detections: DetectionResult[],
  todayStr: string
): Promise<Alert[]> {
  const client = getClient();

  // If no client, return fallback alerts for all detections
  if (!client || detections.length === 0) {
    return detections.map((d) => buildFallbackAlert(d, todayStr));
  }

  // Only send top 5 most severe to AI (cost savings)
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const topDetections = [...detections]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 5);
  const restDetections = detections.filter((d) => !topDetections.includes(d));

  try {
    const prompt = topDetections.map((d, i) =>
      `Alert ${i + 1}: [${d.severity.toUpperCase()}] ${d.type}\n` +
      `Provider: ${d.provider}, Subject: ${d.subject}\n` +
      `Value: ${d.value.toFixed(2)}, Baseline: ${d.baseline.toFixed(2)}, Change: ${d.changePct.toFixed(0)}%\n` +
      `Summary: ${d.message}`
    ).join("\n\n");

    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze these ${topDetections.length} API usage anomalies detected on ${todayStr}. For each, provide detail and investigateSteps.\n\n${prompt}\n\nRespond with JSON array: [{"index": 0, "detail": "...", "investigateSteps": ["step1", "step2", "step3"]}, ...]`,
        },
      ],
    });

    const content = res.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const text = content.text.trim();
    const jsonStr = text.startsWith("[")
      ? text
      : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const aiResults = JSON.parse(jsonStr) as { index: number; detail: string; investigateSteps: string[] }[];

    const enriched: Alert[] = topDetections.map((detection, i) => {
      const aiResult = aiResults.find((r) => r.index === i);
      if (!aiResult) return buildFallbackAlert(detection, todayStr);
      return {
        ...detection,
        id: makeId(detection, todayStr),
        detail: aiResult.detail ?? buildFallbackDetail(detection),
        investigateSteps: aiResult.investigateSteps ?? buildFallbackSteps(detection),
        detectedAt: todayStr,
      };
    });

    // Fallback for the rest
    const rest = restDetections.map((d) => buildFallbackAlert(d, todayStr));
    return [...enriched, ...rest];
  } catch (err) {
    console.error("[alerts/analyzer] AI enrichment failed, using fallbacks:", err);
    return detections.map((d) => buildFallbackAlert(d, todayStr));
  }
}
