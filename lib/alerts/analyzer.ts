/**
 * AI enrichment layer — takes raw DetectionResults plus full key context
 * (purpose, reference documents, code scan findings) and sends them to
 * Claude for plain-language, code-aware anomaly explanation.
 *
 * Falls back gracefully if ANTHROPIC_API_KEY is missing or the API fails.
 *
 * Context priority for Claude:
 *   1. Code scan findings  — the most actionable signal (exact call sites + risks)
 *   2. Reference documents — runbooks, architecture docs, expected patterns
 *   3. Key purpose         — declared intent written by the key's owner
 *   4. Raw anomaly metrics — numbers, baseline, change %
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Alert, DetectionResult } from "@/types/alerts";
import type { CodeScanSummary } from "@/lib/codeScanning";

export interface KeyContextEntry {
  purpose: string | null;
  displayName: string | null;
  provider: string;
  /** Excerpts from uploaded reference documents (first ~1500 chars each) */
  docExcerpts: Array<{ fileName: string; excerpt: string }>;
  /** Code scan result — null if no repos linked or scan not yet run */
  codeScan: CodeScanSummary | null;
}

/** Maps providerKeyId → enrichment context */
export type KeyContextMap = Record<string, KeyContextEntry>;

// ── Anthropic client ──────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── ID generation ─────────────────────────────────────────────────────────────

function makeId(result: DetectionResult, date: string): string {
  const raw = `${result.type}:${result.provider}:${result.subject}:${date}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// ── Fallback (no API key or API failure) ──────────────────────────────────────

function buildFallbackAlert(result: DetectionResult, date: string): Alert {
  return {
    ...result,
    id: makeId(result, date),
    detail: buildFallbackDetail(result),
    investigateSteps: buildFallbackSteps(result),
    detectedAt: date,
  };
}

function buildFallbackDetail(r: DetectionResult): string {
  const model = r.models?.[0] ?? "unknown model";
  switch (r.type) {
    case "cost_spike":
      return `API key "${r.subject}" (${r.provider}) showed a significant cost increase. The daily cost reached $${r.value.toFixed(2)}, which is ${r.changePct.toFixed(0)}% above the $${r.baseline.toFixed(2)} baseline. The primary driver was ${model}.`;
    case "cost_drop":
      return `API key "${r.subject}" (${r.provider}) spend is notably down to $${r.value.toFixed(2)} vs the $${r.baseline.toFixed(2)} daily baseline. This may reflect an intentional change, reduced usage, or a possible integration issue worth verifying.`;
    case "volume_spike":
      return `API key "${r.subject}" (${r.provider}) received ${r.value.toLocaleString()} requests today — a ${r.changePct.toFixed(0)}% increase over the ${Math.round(r.baseline).toLocaleString()} requests/day baseline. Primary model: ${model}.`;
    case "key_model_shift":
      return r.models && r.models.length > 1
        ? `API key "${r.subject}" (${r.provider}) shifted its primary model from ${r.models[1]} to ${r.models[0]}.`
        : `API key "${r.subject}" (${r.provider}) used ${model} for the first time today.`;
    case "new_key":
      return `A new API key "${r.subject}" (${r.provider}) was detected. Total spend so far: $${r.value.toFixed(2)}.`;
    case "key_velocity":
      return `API key "${r.subject}" was created and used on the same calendar day — $${r.value.toFixed(2)} spent. This may indicate a stolen key being immediately exploited.`;
    case "claude_code_on_app_key":
      return `API key "${r.subject}" shows a Claude Code fingerprint (high cache_read vs uncached_input) on what should be app traffic. This pattern may indicate a stolen key being used interactively by an attacker.`;
    case "key_rotation_spike":
      return `${r.value} new API keys appeared in the last 48 hours for ${r.provider}. Rapid key creation is consistent with an active breach response or key farming.`;
    case "render_service_anomaly":
      return r.message;
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
            `Check git history for the project using "${r.subject}" for changes to the model parameter (${r.models[1]} → ${r.models[0]}).`,
            `Compare pricing between ${r.models[1]} and ${r.models[0]} to estimate the ongoing cost impact.`,
            `If unintentional, revert the model setting and audit recent deployments.`,
          ]
        : [
            `Find the codebase using "${r.subject}" and check for recent commits that introduced ${model}.`,
            `Verify the model choice is intentional — AI-generated code sometimes defaults to expensive models.`,
            `Review ${model} pricing on ${r.provider} to confirm this fits your cost targets.`,
          ];
    case "new_key":
      return [
        `Confirm that "${r.subject}" was created intentionally by a member of your team.`,
        `If unexpected, rotate or revoke the key immediately and audit ${r.provider} admin access.`,
        `Tag the key with its project name in AICostCentral so future anomalies are easier to attribute.`,
      ];
    case "key_velocity":
      return [
        `Archive "${r.subject}" in the ${r.provider} console immediately if you did not authorize this usage.`,
        `Check where this key was stored at time of creation — Render env vars, Vercel env vars, or local .env files.`,
        `Review your deployment dashboard for any sessions you don't recognize (Render, Vercel, etc.).`,
        `Rotate any platform credentials (Render API key, Vercel token) that may have exposed this key.`,
      ];
    case "claude_code_on_app_key":
      return [
        `Archive "${r.subject}" in the Anthropic console if you did not authorize interactive use of this key.`,
        `Check the Anthropic console usage report for the source IP or workspace of these sessions.`,
        `Review where this key is stored — Render, Vercel, and local .env files are common leak points.`,
        `Rotate the key and any platform credentials that could expose it; enable KNOWN_GITHUB_OWNERS filtering.`,
      ];
    case "key_rotation_spike":
      return [
        `Review the ${r.provider} console key list — identify which keys are new and whether you created them.`,
        `Cross-reference key creation timestamps against your activity — keys created outside business hours are suspicious.`,
        `If any keys were created by an attacker, archive them and audit usage for the breach window.`,
        `Consider adding BASELINE_START_DATE to exclude compromised-period data from anomaly baselines.`,
      ];
    case "render_service_anomaly":
      return [
        `Go to https://dashboard.render.com and find the flagged service immediately.`,
        `Suspend the service if you don't recognize it — Suspend Service button is in the top-right.`,
        `Review its Logs tab for outbound connections, API calls, and data exfiltration patterns.`,
        `Check its Environment tab for any API keys or credentials set on the service.`,
        `File a report with Render support if attacker-deployed; request billing credit for compute used.`,
      ];
  }
}

// ── Context block builder ─────────────────────────────────────────────────────

function buildKeyContextBlock(
  keyId: string,
  ctx: KeyContextEntry | undefined
): string {
  if (!ctx) return `No context available for key ${keyId}.`;

  const lines: string[] = [];

  if (ctx.purpose) {
    lines.push(`PURPOSE: ${ctx.purpose}`);
  }

  if (ctx.docExcerpts.length > 0) {
    lines.push("\nREFERENCE DOCUMENTS:");
    for (const doc of ctx.docExcerpts) {
      lines.push(`[${doc.fileName}]: ${doc.excerpt.slice(0, 800)}`);
    }
  }

  if (ctx.codeScan && ctx.codeScan.totalCallSites > 0) {
    lines.push("\nCODE ANALYSIS (GitHub):");
    lines.push(ctx.codeScan.plainSummary);
    if (ctx.codeScan.hardcodedKeyFound) {
      lines.push("\n🚨 CRITICAL: Hardcoded API key string found in source code.");
    }
    if (ctx.codeScan.criticalRisks.length > 0) {
      lines.push("\nCRITICAL RISKS:");
      for (const r of ctx.codeScan.criticalRisks) lines.push(`  - ${r}`);
    }
  } else if (ctx.codeScan) {
    lines.push("\nCODE ANALYSIS: No AI call sites found in linked repos.");
  } else {
    lines.push("\nCODE ANALYSIS: No linked repositories.");
  }

  return lines.join("\n");
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI API cost intelligence analyst embedded in AICostCentral.

You receive anomaly detections for API keys alongside full context about how each key is actually used:
- The key's declared PURPOSE (written by the team that owns it)
- REFERENCE DOCUMENTS (runbooks, architecture docs, expected behavior)
- CODE ANALYSIS from GitHub (exact call sites, trigger types, risk patterns found by static analysis)

YOUR JOB: Determine whether each anomaly is EXPECTED (a known pattern from the code/purpose) or UNEXPECTED (a new behavior, broken integration, or active risk). Use the code evidence specifically — if a call site is inside a loop and cost spiked, cite that loop. If the key's purpose says "batch job runs Sunday" and there's a cost drop on Monday, that's likely expected.

Focus on:
1. Cross-referencing the anomaly metrics with the code's actual call patterns and trigger types
2. Identifying whether code-level risks (loops, no max_tokens, user input) could explain the anomaly
3. Flagging hardcoded keys, recursive agents, or unbounded loops as immediate action items

Respond in JSON format only.`;

// ── Main export ───────────────────────────────────────────────────────────────

export async function enrichWithAI(
  detections: DetectionResult[],
  todayStr: string,
  keyContextMap: KeyContextMap = {}
): Promise<Alert[]> {
  const client = getClient();

  if (!client || detections.length === 0) {
    return detections.map((d) => buildFallbackAlert(d, todayStr));
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const topDetections = [...detections]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 5);
  const restDetections = detections.filter((d) => !topDetections.includes(d));

  try {
    const anomalyBlocks = topDetections.map((d, i) => {
      const ctx = d.apiKeyId ? keyContextMap[d.apiKeyId] : undefined;
      const contextBlock = buildKeyContextBlock(d.apiKeyId ?? d.subject, ctx);

      return [
        `--- ANOMALY ${i + 1} ---`,
        `Type: ${d.type} | Severity: ${d.severity.toUpperCase()}`,
        `Key: "${d.subject}" (${d.provider})`,
        `Today: $${d.value.toFixed(4)} | Baseline: $${d.baseline.toFixed(4)} | Change: ${d.changePct.toFixed(0)}%`,
        d.models?.length ? `Models: ${d.models.join(" → ")}` : null,
        `Raw summary: ${d.message}`,
        "",
        "KEY CONTEXT:",
        contextBlock,
      ]
        .filter(Boolean)
        .join("\n");
    });

    const userPrompt =
      `Analyze these ${topDetections.length} API key anomaly/anomalies detected on ${todayStr}.\n` +
      `For each provide: "detail" (3-5 sentences — is this expected or unexpected? cite code evidence. ` +
      `Assess whether this looks like legitimate usage, abuse, a broken integration, or normal variation. ` +
      `Reference specific models, dollar amounts, and code patterns when available.) ` +
      `and "investigateSteps" (exactly 3 specific, actionable steps referencing file names and patterns when known).\n\n` +
      anomalyBlocks.join("\n\n") +
      `\n\nRespond with JSON array: [{"index": 0, "detail": "...", "investigateSteps": ["step1","step2","step3"]}, ...]`;

    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = res.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const text = content.text.trim();
    const jsonStr = text.startsWith("[")
      ? text
      : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const aiResults = JSON.parse(jsonStr) as {
      index: number;
      detail: string;
      investigateSteps: string[];
    }[];

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

    const rest = restDetections.map((d) => buildFallbackAlert(d, todayStr));
    return [...enriched, ...rest];
  } catch (err) {
    console.error("[alerts/analyzer] AI enrichment failed, using fallbacks:", err);
    return detections.map((d) => buildFallbackAlert(d, todayStr));
  }
}
