/**
 * SmartRouter — OpenAI-compatible /v1/chat/completions
 *
 * Drop-in replacement: change base_url to https://aicostcentral.servicevision.io/v1
 * and api_key to a SmartRouter virtual key (sk-sr-...).
 *
 * Phase 5: fallback chains, prompt caching, latency-aware routing, A/B experiments.
 */
import { NextRequest, NextResponse } from "next/server";
import { classifyRequest } from "@/lib/router/classifier";
import { route, VIRTUAL_MODELS } from "@/lib/router/engine";
import { estimateCost } from "@/lib/router/pricing";
import { checkBudget, effectiveTier } from "@/lib/router/budget";
import { injectAnthropicCacheControl, extractCacheReadTokens } from "@/lib/router/cache";
import { forwardWithFallback, type FallbackAttempt } from "@/lib/router/fallback";
import { assignExperiment } from "@/lib/router/experiment";
import { getLatencyStats } from "@/lib/router/latency";
import { normalizeModelName } from "@/lib/router/normalize";
import { pickKey } from "@/lib/router/keyPool";
import { checkAccessPolicy } from "@/lib/router/accessPolicy";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { QualityTier } from "@/types/router";
import type { ProjectRoutingConfig } from "@/lib/db/schema";

// Provider base URLs (OpenAI-compat format for all)
const PROVIDER_URLS: Record<string, string> = {
  openai:    "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  google:    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  groq:      "https://api.groq.com/openai/v1/chat/completions",
  mistral:   "https://api.mistral.ai/v1/chat/completions",
  cohere:    "https://api.cohere.ai/compatibility/v1/chat/completions",
  bedrock:   "", // resolved per-request from project config or env
};

// Per-provider API key env vars for fallback chains
const PROVIDER_KEY_ENVS: Record<string, string> = {
  openai:    "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google:    "GOOGLE_AI_API_KEY",
  groq:      "GROQ_API_KEY",
  mistral:   "MISTRAL_API_KEY",
};

/**
 * Load per-project routing config from DB.
 * Falls back to empty config (balanced tier, all providers) on any error.
 */
async function loadProjectConfig(orgId: string, projectId: string): Promise<ProjectRoutingConfig> {
  if (orgId === "passthrough" || orgId === "default") return {};
  try {
    const project = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId)),
      columns: { routingConfig: true },
    });
    return (project?.routingConfig ?? {}) as ProjectRoutingConfig;
  } catch {
    return {};
  }
}

// Resolve virtual key → base context
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

async function logRequest(data: {
  orgId: string;
  projectId: string;
  modelRequested: string;
  modelUsed: string;
  providerUsed: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUSD: number;
  savingsUSD: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
  callsite?: string;
  fallbackCount: number;
  experimentId?: string;
  experimentVariant?: string;
}) {
  db.insert(schema.requestLogs).values({
    orgId: data.orgId,
    projectId: data.projectId,
    modelRequested: data.modelRequested,
    modelUsed: data.modelUsed,
    providerUsed: data.providerUsed,
    taskType: data.taskType,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    cacheReadTokens: data.cacheReadTokens,
    costUsd: data.costUSD.toFixed(8),
    savingsUsd: data.savingsUSD.toFixed(8),
    latencyMs: data.latencyMs,
    success: data.success,
    errorCode: data.errorCode,
    callsite: data.callsite,
    fallbackCount: data.fallbackCount,
    experimentId: data.experimentId,
    experimentVariant: data.experimentVariant,
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

  const rawModel = (body.model as string) ?? "gpt-4o-mini";
  const messages = (body.messages as Array<{ role: string; content: unknown }>) ?? [];
  const isStream = body.stream === true;
  const callsite = req.headers.get("x-source-file") ?? undefined;
  // OpenRouter-compatible headers (Phase 6)
  const referer = req.headers.get("http-referer") ?? req.headers.get("referer") ?? undefined;
  const appTitle = req.headers.get("x-title") ?? undefined;

  // ── Model name normalization (Phase 6) ──
  // Handles: provider/model, litellm/model, legacy names, OpenRouter aliases
  const normalized = normalizeModelName(rawModel);
  const modelRequested = normalized.modelId;
  // If the normalized provider differs from ctx.provider (e.g. "anthropic/claude-...")
  // update the provider for routing — only for passthrough where we use the caller's key
  if (!ctx.passthrough && normalized.provider !== ctx.provider && PROVIDER_URLS[normalized.provider]) {
    ctx.provider = normalized.provider;
  }

  // Unique nonce for deterministic A/B assignment
  const requestNonce = randomUUID();

  // ── Load project routing config + budget + latency stats (parallel) ──
  const [projectConfig, budgetStatus, latencyStats] = await Promise.all([
    loadProjectConfig(ctx.orgId, ctx.projectId),
    ctx.passthrough
      ? Promise.resolve({ exceeded: false } as const)
      : checkBudget(ctx.orgId, ctx.projectId, {}),
    ctx.passthrough
      ? Promise.resolve([])
      : getLatencyStats(ctx.orgId),
  ]);

  if (budgetStatus.exceeded && budgetStatus.action === "block") {
    return NextResponse.json({
      error: { message: budgetStatus.reason, type: "insufficient_quota", code: "budget_exceeded" },
    }, { status: 429 });
  }

  // ── Access policy (IP / origin / model allowlists) ──
  if (!ctx.passthrough) {
    const violation = checkAccessPolicy({
      clientIp: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      origin: req.headers.get("origin") ?? req.headers.get("referer"),
      modelRequested: rawModel,
      config: projectConfig,
    });
    if (violation) {
      return NextResponse.json({
        error: {
          message: violation.message,
          type: "invalid_request_error",
          code: `access_denied_${violation.dimension}`,
        },
      }, { status: 403 });
    }
  }

  // ── Task Classification ──
  const classification = classifyRequest({
    model: modelRequested,
    messages: messages as never,
    temperature: body.temperature as number | undefined,
    max_tokens: body.max_tokens as number | undefined,
    response_format: body.response_format as never,
    tools: body.tools as unknown[],
  });

  // ── A/B Experiment assignment ──
  const experimentAssignment = await assignExperiment(
    ctx.orgId,
    ctx.projectId,
    classification.taskType,
    requestNonce,
  );

  // ── Routing ──
  let modelToUse = modelRequested;
  let providerToUse = ctx.provider;
  let routingDecision = null;

  const isVirtualModel = modelRequested in VIRTUAL_MODELS;
  const shouldRoute = !ctx.passthrough &&
    (projectConfig.autoRoute !== false) &&
    (isVirtualModel || process.env.SMARTROUTER_AUTO_ROUTE === "true");

  if (experimentAssignment) {
    // A/B experiment overrides the routing decision
    modelToUse = experimentAssignment.modelId;
  } else if (shouldRoute) {
    const baseTier = isVirtualModel ? VIRTUAL_MODELS[modelRequested] : (projectConfig.qualityTier ?? ctx.qualityTier);
    const tier = effectiveTier(baseTier, budgetStatus);

    routingDecision = route({
      modelRequested,
      taskType: classification.taskType,
      estimatedInputTokens: classification.estimatedInputTokens,
      estimatedOutputTokens: classification.estimatedOutputTokens,
      qualityTier: tier,
      allowedProviders: projectConfig.allowedProviders,
      taskOverrides: projectConfig.taskOverrides,
      requiresVision: classification.requiresVision,
      requiresJsonMode: classification.requiresJsonMode,
      requiresFunctionCalling: classification.requiresFunctionCalling,
      latencyWeight: projectConfig.latencyWeight ?? 0,
      latencyStats,
    });
    modelToUse = routingDecision.winner.modelId;
    providerToUse = routingDecision.winner.provider;
  }

  // ── Prompt caching (Anthropic only) ──
  const cachingEnabled = projectConfig.promptCaching !== false; // default true
  const cachedMessages = injectAnthropicCacheControl(messages, providerToUse, cachingEnabled);

  // ── Build fallback chain ──
  // pickKey() round-robins across all active DB keys for the provider;
  // falls back to env var if no DB keys are found.
  const primaryKey = ctx.passthrough
    ? ctx.providerKey
    : await pickKey(ctx.orgId, providerToUse);

  const primaryAttempt: FallbackAttempt = {
    provider: providerToUse,
    providerUrl: PROVIDER_URLS[providerToUse] ?? PROVIDER_URLS.openai,
    providerKey: primaryKey ?? "",
    modelId: modelToUse,
  };

  const fallbackAttempts: FallbackAttempt[] = await Promise.all(
    (projectConfig.fallbackProviders ?? [])
      .filter((p) => p !== providerToUse)
      .map(async (p) => {
        const key = ctx.passthrough
          ? (process.env[PROVIDER_KEY_ENVS[p] ?? ""] ?? null)
          : await pickKey(ctx.orgId, p);
        return key ? { provider: p, providerUrl: PROVIDER_URLS[p] ?? "", providerKey: key, modelId: modelToUse } as FallbackAttempt : null;
      }),
  ).then((arr) => arr.filter((a): a is FallbackAttempt => a !== null));

  const forwardBody = { ...body, model: modelToUse, messages: cachedMessages };

  // ── Forward with fallback ──
  let fallbackResult: Awaited<ReturnType<typeof forwardWithFallback>>;
  try {
    fallbackResult = await forwardWithFallback(primaryAttempt, fallbackAttempts, forwardBody);
  } catch (e: unknown) {
    await logRequest({
      orgId: ctx.orgId, projectId: ctx.projectId,
      modelRequested, modelUsed: modelToUse, providerUsed: providerToUse,
      taskType: classification.taskType,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUSD: 0, savingsUSD: 0,
      latencyMs: Date.now() - startMs, success: false, errorCode: "network_error",
      callsite, fallbackCount: fallbackAttempts.length,
      experimentId: experimentAssignment?.experimentId,
      experimentVariant: experimentAssignment?.variant,
    });
    return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Provider unreachable", type: "api_error" } }, { status: 502 });
  }

  const { response: providerResponse, providerUsed: finalProvider, modelUsed: finalModel, fallbackCount } = fallbackResult;
  const latencyMs = Date.now() - startMs;

  if (isStream) {
    // Reject error responses before setting up the stream — same as non-streaming path.
    // Without this check, 429/402/401 bodies pipe through the transform, flush() fires
    // with success=true, and estimated tokens get logged as real usage.
    if (!providerResponse.ok) {
      const errBody = await providerResponse.json().catch(() => ({}));
      await logRequest({
        orgId: ctx.orgId, projectId: ctx.projectId,
        modelRequested, modelUsed: finalModel, providerUsed: finalProvider,
        taskType: classification.taskType,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUSD: 0, savingsUSD: 0,
        latencyMs: Date.now() - startMs, success: false,
        errorCode: String((errBody as { error?: { code?: unknown } })?.error?.code ?? providerResponse.status),
        callsite, fallbackCount,
        experimentId: experimentAssignment?.experimentId,
        experimentVariant: experimentAssignment?.variant,
      });
      return NextResponse.json(errBody, { status: providerResponse.status });
    }

    if (!providerResponse.body) {
      return NextResponse.json({ error: { message: "Empty stream body", type: "api_error" } }, { status: 502 });
    }

    const streamHeaders = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-sr-model-used": finalModel,
      "x-sr-model-requested": modelRequested,
      "x-sr-task-type": classification.taskType,
      "x-sr-provider-used": finalProvider,
      ...(fallbackCount > 0 ? { "x-sr-fallback-count": fallbackCount.toString() } : {}),
      ...(routingDecision ? {
        "x-sr-savings-usd": routingDecision.estimatedSavingsUSD.toFixed(6),
        "x-sr-savings-pct": routingDecision.estimatedSavingsPct.toString(),
      } : {}),
      ...(experimentAssignment ? {
        "x-sr-experiment-id": experimentAssignment.experimentId,
        "x-sr-experiment-variant": experimentAssignment.variant,
      } : {}),
    });

    const decoder = new TextDecoder();
    // Start at 0 — only update from actual stream usage chunks.
    // Previously initialised to estimated values, which caused failed/empty
    // streams to log phantom token usage.
    let usageInputTokens = 0;
    let usageOutputTokens = 0;
    let gotActualUsage = false;

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        const text = decoder.decode(chunk, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
            if (parsed.usage?.prompt_tokens != null) {
              usageInputTokens = parsed.usage.prompt_tokens;
              gotActualUsage = true;
            }
            if (parsed.usage?.completion_tokens != null) {
              usageOutputTokens = parsed.usage.completion_tokens;
              gotActualUsage = true;
            }
          } catch { /* non-JSON chunk — ignore */ }
        }
      },
      flush() {
        // Only log if we received real usage data from the provider.
        // If gotActualUsage is false the stream produced no tokens (error body,
        // empty response, or pre-token rejection) — don't inflate usage counts.
        if (!gotActualUsage) return;
        const costUSD = estimateCost(finalModel, usageInputTokens, usageOutputTokens);
        logRequest({
          orgId: ctx.orgId, projectId: ctx.projectId,
          modelRequested, modelUsed: finalModel, providerUsed: finalProvider,
          taskType: classification.taskType,
          inputTokens: usageInputTokens, outputTokens: usageOutputTokens, cacheReadTokens: 0,
          costUSD, savingsUSD: routingDecision?.estimatedSavingsUSD ?? 0,
          latencyMs: Date.now() - startMs, success: true, callsite, fallbackCount,
          experimentId: experimentAssignment?.experimentId,
          experimentVariant: experimentAssignment?.variant,
        });
      },
    });

    return new Response(providerResponse.body.pipeThrough(transformStream), {
      status: providerResponse.status,
      headers: streamHeaders,
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
  const cacheReadTokens = extractCacheReadTokens(responseData, finalProvider);
  const costUSD = estimateCost(finalModel, inputTokens, outputTokens);
  const savingsUSD = routingDecision?.estimatedSavingsUSD ?? 0;

  await logRequest({
    orgId: ctx.orgId, projectId: ctx.projectId,
    modelRequested, modelUsed: finalModel, providerUsed: finalProvider,
    taskType: classification.taskType,
    inputTokens, outputTokens, cacheReadTokens, costUSD, savingsUSD,
    latencyMs, success: true, callsite, fallbackCount,
    experimentId: experimentAssignment?.experimentId,
    experimentVariant: experimentAssignment?.variant,
  });

  const enriched = {
    ...responseData,
    model: finalModel,
    _smartrouter: {
      model_requested: rawModel,
      model_normalized: modelRequested,
      model_used: finalModel,
      provider_used: finalProvider,
      task_type: classification.taskType,
      task_confidence: classification.confidence,
      cost_usd: parseFloat(costUSD.toFixed(8)),
      savings_usd: parseFloat(savingsUSD.toFixed(8)),
      savings_pct: routingDecision?.estimatedSavingsPct ?? 0,
      cache_read_tokens: cacheReadTokens,
      fallback_count: fallbackCount,
      latency_ms: latencyMs,
      candidates: routingDecision?.candidates?.slice(0, 3) ?? [],
      experiment: experimentAssignment
        ? { id: experimentAssignment.experimentId, variant: experimentAssignment.variant }
        : null,
      ...(normalized.isAlias ? { model_alias_from: rawModel } : {}),
    },
  };

  return NextResponse.json(enriched, {
    headers: {
      "x-sr-model-used": finalModel,
      "x-sr-model-requested": modelRequested,
      "x-sr-model-original": rawModel,
      "x-sr-task-type": classification.taskType,
      "x-sr-provider-used": finalProvider,
      "x-sr-cost-usd": costUSD.toFixed(8),
      "x-sr-savings-usd": savingsUSD.toFixed(8),
      "x-sr-savings-pct": (routingDecision?.estimatedSavingsPct ?? 0).toString(),
      ...(fallbackCount > 0 ? { "x-sr-fallback-count": fallbackCount.toString() } : {}),
      ...(cacheReadTokens > 0 ? { "x-sr-cache-read-tokens": cacheReadTokens.toString() } : {}),
      ...(experimentAssignment ? {
        "x-sr-experiment-id": experimentAssignment.experimentId,
        "x-sr-experiment-variant": experimentAssignment.variant,
      } : {}),
    },
  });
}
