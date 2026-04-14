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
  switch (r.type) {
    case "cost_spike":
      return `${r.subject} on ${r.provider} showed a significant cost increase on ${new Date().toLocaleDateString()}. The daily cost reached $${r.value.toFixed(2)}, which is ${r.changePct.toFixed(0)}% above the ${r.baseline.toFixed(2)} baseline. This may indicate a traffic surge, an inefficient prompt, or a new workflow using this model.`;
    case "cost_drop":
      return `${r.subject} on ${r.provider} showed a significant cost decrease, dropping to $${r.value.toFixed(2)} vs the $${r.baseline.toFixed(2)} baseline. This could indicate a broken integration, a deployment issue, or intentional change.`;
    case "volume_spike":
      return `${r.subject} on ${r.provider} received ${r.value.toLocaleString()} requests, a ${r.changePct.toFixed(0)}% increase over the baseline of ${Math.round(r.baseline).toLocaleString()} requests/day.`;
    case "new_model":
      return `A new model ${r.subject} on ${r.provider} appeared in usage data for the first time. It generated $${r.value.toFixed(2)} in charges and was not seen in prior usage history.`;
    case "new_key":
      return `A new API key "${r.subject}" on ${r.provider} was detected with first usage recorded recently. Total spend so far: $${r.value.toFixed(2)}.`;
  }
}

function buildFallbackSteps(r: DetectionResult): string[] {
  switch (r.type) {
    case "cost_spike":
    case "volume_spike":
      return [
        `Check the AICostCentral dashboard By API Key tab to identify which project is driving ${r.subject} usage.`,
        `Review recent deployments or code changes that might have increased call frequency or token count.`,
        `Set a daily cost alert threshold in your AI provider console to get notified before charges accumulate.`,
      ];
    case "cost_drop":
      return [
        `Verify that the application or service using ${r.subject} is still running and making API calls.`,
        `Check your deployment logs for errors or configuration changes made in the last 24 hours.`,
        `Test the integration manually to confirm the API key is still valid and the endpoint is reachable.`,
      ];
    case "new_model":
      return [
        `Identify which codebase introduced ${r.subject} — check recent commits for model name changes.`,
        `Verify this model was intentionally adopted (not a typo or hallucination from AI-generated code).`,
        `Review the pricing for ${r.subject} on ${r.provider} to ensure it fits your cost targets.`,
      ];
    case "new_key":
      return [
        `Confirm that "${r.subject}" was created intentionally by your team.`,
        `If unexpected, rotate or revoke the key immediately and audit who has admin access.`,
        `Tag the key in AICostCentral settings with its project name for future tracking.`,
      ];
  }
}

const SYSTEM_PROMPT = `You are an AI spending analyst helping engineering teams understand unusual patterns in their AI API usage.
When given anomaly detection results, provide:
1. A clear 2-3 sentence business explanation of what happened and why it matters
2. Exactly 3 specific, actionable investigation steps

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
