/**
 * SmartRouter — OpenAI-compatible /v1/chat/completions
 *
 * Drop-in replacement: change base_url to https://aicostcentral.servicevision.io/v1
 * and api_key to a SmartRouter virtual key (sk-sr-...).
 *
 * Phase 1: passthrough mode (logs everything, routes as-is).
 * Phase 2: task classification + smart routing.
 */
import { NextRequest, NextResponse } from "next/server";
import { classifyRequest } from "@/lib/router/classifier";
import { route, VIRTUAL_MODELS } from "@/lib/router/engine";
import { estimateCost, getPricing } from "@/lib/router/pricing";
import { db, schema } from "@/lib/db";
import type { QualityTier } from "@/types/router";

// Provider base URLs
const PROVIDER_URLS: Record<string, string> = {
  openai:    "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  google:    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  groq:      "https://api.groq.com/openai/v1/chat/completions",
  mistral:   "https://api.mistral.ai/v1/chat/completions",
};

// For Phase 1: resolve virtual key → project config
// Phase 2: will hit KV/DB
function resolveVirtualKey(authHeader: string | null): {
  projectId: string;
  orgId: string;
  qualityTier: QualityTier;
  passthrough: boolean;
  providerKey: string | null;
  provider: string;
} | null {
  if (!authHeader) return null;
  const raw = authHeader.replace("Bearer ", "");

  // For Phase 1 MVP: if key starts with sk-sr-, validate against env; else treat as direct OpenAI key
  if (raw.startsWith("sk-sr-")) {
    const masterKey = process.env.SMARTROUTER_MASTER_KEY;
    if (masterKey && raw === masterKey) {
      return {
        projectId: "default",
        orgId: "default",
        qualityTier: (process.env.SMARTROUTER_DEFAULT_TIER as QualityTier) ?? "balanced",
        passthrough: false,
        providerKey: process.env.OPENAI_API_KEY ?? null,
        provider: "openai",
      };
    }
    return null;
  }

  // Passthrough: treat the key as an OpenAI key directly
  if (raw.startsWith("sk-") || raw.startsWith("sk-proj-") || raw.startsWith("sk-admin-")) {
    return {
      projectId: "passthrough",
      orgId: "passthrough",
      qualityTier: "balanced",
      passthrough: true,
      providerKey: raw,
      provider: "openai",
    };
  }

  return null;
}

async function forwardToProvider(
  providerUrl: string,
  providerKey: string,
  body: Record<string, unknown>,
  stream: boolean
): Promise<Response> {
  return fetch(providerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerKey}`,
    },
    body: JSON.stringify(body),
    ...(stream ? {} : {}),
  });
}

async function logRequest(data: {
  orgId: string;
  projectId: string;
  modelRequested: string;
  modelUsed: string;
  providerUsed: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  savingsUSD: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
}) {
  // Fire-and-forget — never block the response path
  db.insert(schema.requestLogs).values({
    orgId: data.orgId,
    projectId: data.projectId,
    modelRequested: data.modelRequested,
    modelUsed: data.modelUsed,
    providerUsed: data.providerUsed,
    taskType: data.taskType,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    costUsd: data.costUSD.toFixed(8),
    savingsUsd: data.savingsUSD.toFixed(8),
    latencyMs: data.latencyMs,
    success: data.success,
    errorCode: data.errorCode,
  }).catch((err: unknown) => {
    console.warn("[SmartRouter] request log insert failed:", err instanceof Error ? err.message : err);
  });
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const auth = req.headers.get("authorization");
  const ctx = resolveVirtualKey(auth);

  if (!ctx) {
    return NextResponse.json({ error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } }, { status: 401 });
  }

  if (!ctx.providerKey) {
    return NextResponse.json({ error: { message: "Provider key not configured for this project", type: "invalid_request_error" } }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, { status: 400 });
  }

  const modelRequested = (body.model as string) ?? "gpt-4o-mini";
  const messages = (body.messages as Array<{ role: string; content: unknown }>) ?? [];
  const isStream = body.stream === true;

  // ── Task Classification ──
  const classification = classifyRequest({
    model: modelRequested,
    messages: messages as never,
    temperature: body.temperature as number | undefined,
    max_tokens: body.max_tokens as number | undefined,
    response_format: body.response_format as never,
    tools: body.tools as unknown[],
  });

  // ── Routing ──
  let modelToUse = modelRequested;
  let routingDecision = null;

  const isVirtualModel = modelRequested in VIRTUAL_MODELS;

  if (!ctx.passthrough && (isVirtualModel || process.env.SMARTROUTER_AUTO_ROUTE === "true")) {
    const tier = isVirtualModel ? VIRTUAL_MODELS[modelRequested] : ctx.qualityTier;
    routingDecision = route({
      modelRequested,
      taskType: classification.taskType,
      estimatedInputTokens: classification.estimatedInputTokens,
      estimatedOutputTokens: classification.estimatedOutputTokens,
      qualityTier: tier,
      requiresVision: classification.requiresVision,
      requiresJsonMode: classification.requiresJsonMode,
      requiresFunctionCalling: classification.requiresFunctionCalling,
    });
    modelToUse = routingDecision.winner.modelId;
  }

  // ── Forward to Provider ──
  const providerUrl = PROVIDER_URLS[ctx.provider] ?? PROVIDER_URLS.openai;
  const forwardBody = { ...body, model: modelToUse };

  let providerResponse: Response;
  try {
    providerResponse = await forwardToProvider(providerUrl, ctx.providerKey, forwardBody, isStream);
  } catch (e: unknown) {
    await logRequest({
      orgId: ctx.orgId, projectId: ctx.projectId,
      modelRequested, modelUsed: modelToUse, providerUsed: ctx.provider,
      taskType: classification.taskType,
      inputTokens: 0, outputTokens: 0, costUSD: 0, savingsUSD: 0,
      latencyMs: Date.now() - startMs, success: false,
      errorCode: "network_error",
    });
    return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Provider unreachable", type: "api_error" } }, { status: 502 });
  }

  const latencyMs = Date.now() - startMs;

  if (isStream) {
    if (!providerResponse.body) {
      return NextResponse.json({ error: { message: "Empty stream body", type: "api_error" } }, { status: 502 });
    }

    // Intercept the stream to extract token usage from the final [DONE] chunk,
    // then log the request. The caller receives an unmodified byte stream.
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-sr-model-used": modelToUse,
      "x-sr-model-requested": modelRequested,
      "x-sr-task-type": classification.taskType,
      ...(routingDecision ? {
        "x-sr-savings-usd": routingDecision.estimatedSavingsUSD.toFixed(6),
        "x-sr-savings-pct": routingDecision.estimatedSavingsPct.toString(),
      } : {}),
    });

    const decoder = new TextDecoder();
    let usageInputTokens = classification.estimatedInputTokens;
    let usageOutputTokens = classification.estimatedOutputTokens;

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        // Parse SSE lines for usage data in the final chunk
        const text = decoder.decode(chunk, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
            if (parsed.usage?.prompt_tokens) usageInputTokens = parsed.usage.prompt_tokens;
            if (parsed.usage?.completion_tokens) usageOutputTokens = parsed.usage.completion_tokens;
          } catch { /* non-JSON chunk — ignore */ }
        }
      },
      flush() {
        const costUSD = estimateCost(modelToUse, usageInputTokens, usageOutputTokens);
        logRequest({
          orgId: ctx.orgId, projectId: ctx.projectId,
          modelRequested, modelUsed: modelToUse, providerUsed: ctx.provider,
          taskType: classification.taskType,
          inputTokens: usageInputTokens, outputTokens: usageOutputTokens,
          costUSD, savingsUSD: routingDecision?.estimatedSavingsUSD ?? 0,
          latencyMs: Date.now() - startMs, success: true,
        });
      },
    });

    return new Response(providerResponse.body.pipeThrough(transformStream), {
      status: providerResponse.status,
      headers,
    });
  }

  // Non-streaming: parse and annotate
  if (!providerResponse.ok) {
    const errBody = await providerResponse.json().catch(() => ({}));
    return NextResponse.json(errBody, { status: providerResponse.status });
  }

  const responseData = await providerResponse.json();
  const usage = responseData.usage ?? {};
  const inputTokens = usage.prompt_tokens ?? classification.estimatedInputTokens;
  const outputTokens = usage.completion_tokens ?? classification.estimatedOutputTokens;
  const costUSD = estimateCost(modelToUse, inputTokens, outputTokens);
  const savingsUSD = routingDecision?.estimatedSavingsUSD ?? 0;

  await logRequest({
    orgId: ctx.orgId, projectId: ctx.projectId,
    modelRequested, modelUsed: modelToUse, providerUsed: ctx.provider,
    taskType: classification.taskType,
    inputTokens, outputTokens, costUSD, savingsUSD,
    latencyMs, success: true,
  });

  // Inject SmartRouter metadata
  const enriched = {
    ...responseData,
    model: modelToUse,
    _smartrouter: {
      model_requested: modelRequested,
      model_used: modelToUse,
      task_type: classification.taskType,
      task_confidence: classification.confidence,
      cost_usd: parseFloat(costUSD.toFixed(8)),
      savings_usd: parseFloat(savingsUSD.toFixed(8)),
      savings_pct: routingDecision?.estimatedSavingsPct ?? 0,
      latency_ms: latencyMs,
      candidates: routingDecision?.candidates?.slice(0, 3) ?? [],
    },
  };

  return NextResponse.json(enriched, {
    headers: {
      "x-sr-model-used": modelToUse,
      "x-sr-model-requested": modelRequested,
      "x-sr-task-type": classification.taskType,
      "x-sr-cost-usd": costUSD.toFixed(8),
      "x-sr-savings-usd": savingsUSD.toFixed(8),
      "x-sr-savings-pct": (routingDecision?.estimatedSavingsPct ?? 0).toString(),
    },
  });
}
