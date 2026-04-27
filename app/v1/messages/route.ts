/**
 * SmartRouter — Anthropic-native /v1/messages transparent proxy
 *
 * Drop-in replacement for https://api.anthropic.com:
 *   Change base_url to https://aicostcentral.app/v1
 *   Set api_key to a virtual key (sk-sr-...)
 *
 * Virtual keys are registered via env vars (see lib/router/virtualKeys.ts):
 *   SMARTROUTER_KEY_{SLUG}           — virtual key value
 *   SMARTROUTER_ANTHROPIC_KEY_{SLUG} — real sk-ant-... key
 *   SMARTROUTER_BUDGET_{SLUG}        — daily budget in USD
 *
 * Supports both streaming (SSE) and non-streaming responses.
 * Usage tokens are extracted from the response and logged to request_logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveVirtualKeyForAnthropic } from "@/lib/router/virtualKeys";
import { checkBudget } from "@/lib/router/budget";
import { db, schema } from "@/lib/db";
import type { ProjectRoutingConfig } from "@/lib/db/schema";

export const maxDuration = 60;

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

// Headers we never forward (upstream request or downstream response)
const STRIP_HEADERS = new Set([
  "host",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-real-ip",
  "authorization",
  "content-length",
  "connection",
  "transfer-encoding",
  // content-encoding must be stripped from the response: upstream.text() already
  // decompresses the body; forwarding "gzip" would cause the client to double-decompress
  "content-encoding",
]);

function logRequest(data: {
  orgId: string;
  projectId: string;
  modelRequested: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUSD: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
  callsite?: string;
}) {
  // Fire-and-forget — never block the response path
  db.insert(schema.requestLogs).values({
    orgId: data.orgId,
    projectId: data.projectId,
    modelRequested: data.modelRequested,
    modelUsed: data.modelRequested, // transparent proxy — no model switching
    providerUsed: "anthropic",
    taskType: "chat",
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    cacheReadTokens: data.cacheReadTokens,
    costUsd: data.costUSD.toFixed(8),
    savingsUsd: "0",
    latencyMs: data.latencyMs,
    success: data.success,
    errorCode: data.errorCode,
    callsite: data.callsite,
    fallbackCount: 0,
  }).catch((err: unknown) => {
    console.warn("[/v1/messages] log insert failed:", err instanceof Error ? err.message : err);
  });
}

/**
 * Rough Anthropic pricing for logging.
 * These are approximate — the daily-digest cron applies precise pricing later.
 */
function estimateAnthropicCost(model: string, inputTokens: number, outputTokens: number, cacheReadTokens: number): number {
  // Cache reads are ~10% of input price
  const rates: Record<string, { input: number; output: number }> = {
    "claude-opus-4":     { input: 15,   output: 75 },
    "claude-opus-4-5":   { input: 15,   output: 75 },
    "claude-sonnet-4":   { input: 3,    output: 15 },
    "claude-sonnet-4-5": { input: 3,    output: 15 },
    "claude-sonnet-4-6": { input: 3,    output: 15 },
    "claude-haiku-4":    { input: 0.8,  output: 4 },
    "claude-haiku-4-5":  { input: 0.8,  output: 4 },
  };

  const key = Object.keys(rates).find((k) => model.includes(k.replace("claude-", ""))) ?? "claude-sonnet-4-6";
  const r = rates[key] ?? { input: 3, output: 15 };
  const inputCost  = (inputTokens / 1_000_000) * r.input;
  const outputCost = (outputTokens / 1_000_000) * r.output;
  const cacheCost  = (cacheReadTokens / 1_000_000) * r.input * 0.1;
  return inputCost + outputCost + cacheCost;
}

/** Parse usage from a complete (non-streaming) Anthropic response */
function extractNonStreamingUsage(body: unknown): { input: number; output: number; cacheRead: number } {
  if (typeof body !== "object" || body === null) return { input: 0, output: 0, cacheRead: 0 };
  const b = body as Record<string, unknown>;
  const usage = b.usage as Record<string, number> | undefined;
  if (!usage) return { input: 0, output: 0, cacheRead: 0 };
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * Stream pass-through with SSE tapping.
 *
 * Anthropic SSE events we care about:
 *   message_start  → data.message.usage.input_tokens (+ cache_read_input_tokens)
 *   message_delta  → data.usage.output_tokens
 *
 * All bytes are forwarded verbatim to the client; we only peek at the text.
 */
function buildStreamResponse(
  upstream: Response,
  onUsage: (input: number, output: number, cacheRead: number) => void,
): Response {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let usageFired = false;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      // Peek at SSE lines
      const text = decoder.decode(chunk, { stream: true });
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as Record<string, unknown>;
          if (evt.type === "message_start") {
            const msg = evt.message as Record<string, unknown> | undefined;
            const usage = msg?.usage as Record<string, number> | undefined;
            if (usage) {
              inputTokens = usage.input_tokens ?? 0;
              cacheReadTokens = usage.cache_read_input_tokens ?? 0;
            }
          } else if (evt.type === "message_delta") {
            const usage = evt.usage as Record<string, number> | undefined;
            if (usage) {
              outputTokens = usage.output_tokens ?? 0;
            }
          } else if (evt.type === "message_stop" && !usageFired) {
            usageFired = true;
            onUsage(inputTokens, outputTokens, cacheReadTokens);
          }
        } catch {
          // Malformed SSE chunk — ignore, still forward
        }
      }
    },
    flush() {
      // Fire usage even if message_stop wasn't seen (e.g. truncated stream)
      if (!usageFired) {
        usageFired = true;
        onUsage(inputTokens, outputTokens, cacheReadTokens);
      }
    },
  });

  // Pipe upstream body through our transform
  upstream.body!.pipeTo(writable).catch(() => {
    // Client disconnected — acceptable
  });

  // Build response headers from upstream
  const headers = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!STRIP_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  });
  headers.set("content-type", "text/event-stream");
  headers.delete("content-length"); // chunked encoding — no fixed length

  return new Response(readable, {
    status: upstream.status,
    headers,
  });
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Anthropic SDK sends API key in x-api-key header (not Authorization: Bearer)
  const rawKey = req.headers.get("x-api-key");
  if (!rawKey) {
    return NextResponse.json(
      { type: "error", error: { type: "authentication_error", message: "Missing x-api-key header" } },
      { status: 401 }
    );
  }

  const ctx = resolveVirtualKeyForAnthropic(rawKey);
  if (!ctx) {
    return NextResponse.json(
      { type: "error", error: { type: "authentication_error", message: "Invalid API key" } },
      { status: 401 }
    );
  }

  // ── Budget check ─────────────────────────────────────────────────────────
  if (ctx.dailyBudgetUsd !== null) {
    const config: ProjectRoutingConfig = {
      dailyBudgetUsd: ctx.dailyBudgetUsd,
      budgetAction: "block",
    };
    const budget = await checkBudget(ctx.orgId, ctx.projectId, config);
    if (budget.exceeded) {
      return NextResponse.json(
        { type: "error", error: { type: "rate_limit_error", message: budget.reason } },
        { status: 429 }
      );
    }
  }

  // ── Forward request ───────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { type: "error", error: { type: "invalid_request_error", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const modelRequested = (typeof body === "object" && body !== null)
    ? String((body as Record<string, unknown>).model ?? "unknown")
    : "unknown";
  const isStream = typeof body === "object" && body !== null && (body as Record<string, unknown>).stream === true;
  const callsite = req.headers.get("x-source-file") ?? undefined;

  // Build upstream headers
  const upstreamHeaders = new Headers();
  req.headers.forEach((v, k) => {
    if (!STRIP_HEADERS.has(k.toLowerCase())) upstreamHeaders.set(k, v);
  });
  upstreamHeaders.set("x-api-key", ctx.realApiKey);
  upstreamHeaders.set("content-type", "application/json");
  if (!upstreamHeaders.has("anthropic-version")) {
    upstreamHeaders.set("anthropic-version", DEFAULT_ANTHROPIC_VERSION);
  }

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream fetch failed";
    logRequest({
      orgId: ctx.orgId,
      projectId: ctx.projectId,
      modelRequested,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUSD: 0,
      latencyMs: Date.now() - startMs,
      success: false,
      errorCode: "upstream_fetch_error",
      callsite,
    });
    return NextResponse.json(
      { type: "error", error: { type: "api_error", message: msg } },
      { status: 502 }
    );
  }

  // ── Streaming response ────────────────────────────────────────────────────
  if (isStream && upstream.body) {
    return buildStreamResponse(upstream, (input, output, cacheRead) => {
      const latencyMs = Date.now() - startMs;
      const costUSD = estimateAnthropicCost(modelRequested, input, output, cacheRead);
      logRequest({
        orgId: ctx.orgId,
        projectId: ctx.projectId,
        modelRequested,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        costUSD,
        latencyMs,
        success: upstream.ok,
        errorCode: upstream.ok ? undefined : String(upstream.status),
        callsite,
      });
    });
  }

  // ── Non-streaming response ────────────────────────────────────────────────
  const responseText = await upstream.text();
  const latencyMs = Date.now() - startMs;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(responseText);
  } catch {
    parsedBody = null;
  }

  const { input, output, cacheRead } = extractNonStreamingUsage(parsedBody);
  const costUSD = estimateAnthropicCost(modelRequested, input, output, cacheRead);

  logRequest({
    orgId: ctx.orgId,
    projectId: ctx.projectId,
    modelRequested,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    costUSD,
    latencyMs,
    success: upstream.ok,
    errorCode: upstream.ok ? undefined : String(upstream.status),
    callsite,
  });

  // Forward upstream response headers (minus stripped ones)
  const responseHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!STRIP_HEADERS.has(k.toLowerCase())) responseHeaders.set(k, v);
  });
  responseHeaders.set("content-type", "application/json");

  return new Response(responseText, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
