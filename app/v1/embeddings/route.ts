/**
 * SmartRouter — OpenAI-compatible POST /v1/embeddings
 *
 * Routes to cheapest embedding model. For embeddings, cost wins — no quality tradeoff.
 *
 * Virtual model aliases:
 *   smart-embedding        → text-embedding-3-small (cheapest, $0.02/1M)
 *   smart-embedding-large  → text-embedding-3-large (higher dims, $0.13/1M)
 *
 * Logs every request to request_logs (fire-and-forget).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { estimateCost } from "@/lib/router/pricing";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

const EMBEDDING_ALIASES: Record<string, string> = {
  "smart-embedding":       "text-embedding-3-small",
  "smart-embedding-large": "text-embedding-3-large",
};

function resolveVirtualKey(authHeader: string | null): {
  orgId: string;
  projectId: string;
  passthrough: boolean;
  providerKey: string | null;
} | null {
  if (!authHeader) return null;
  const raw = authHeader.replace("Bearer ", "");

  if (raw.startsWith("sk-sr-")) {
    const masterKey = process.env.SMARTROUTER_MASTER_KEY;
    if (masterKey && raw === masterKey) {
      return { orgId: "default", projectId: "default", passthrough: false, providerKey: process.env.OPENAI_API_KEY ?? null };
    }
    return null;
  }

  if (raw.startsWith("sk-") || raw.startsWith("sk-proj-") || raw.startsWith("sk-admin-")) {
    return { orgId: "passthrough", projectId: "passthrough", passthrough: true, providerKey: raw };
  }

  return null;
}

function logRequest(data: {
  orgId: string; projectId: string;
  modelRequested: string; modelUsed: string;
  inputTokens: number; costUSD: number;
  latencyMs: number; success: boolean; errorCode?: string;
}) {
  db.insert(schema.requestLogs).values({
    orgId: data.orgId, projectId: data.projectId,
    modelRequested: data.modelRequested, modelUsed: data.modelUsed,
    providerUsed: "openai", taskType: "embedding",
    inputTokens: data.inputTokens, outputTokens: 0,
    costUsd: data.costUSD.toFixed(8), savingsUsd: "0",
    latencyMs: data.latencyMs, success: data.success, errorCode: data.errorCode,
  }).catch((err: unknown) => {
    console.warn("[SmartRouter/embeddings] log failed:", err instanceof Error ? err.message : err);
  });
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const ctx = resolveVirtualKey(req.headers.get("authorization"));

  if (!ctx) {
    return NextResponse.json({ error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } }, { status: 401 });
  }

  if (!ctx.providerKey) {
    return NextResponse.json({ error: { message: "Provider key not configured", type: "invalid_request_error" } }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, { status: 400 });
  }

  const modelRequested = (body.model as string) ?? "text-embedding-3-small";
  const modelToUse = EMBEDDING_ALIASES[modelRequested] ?? modelRequested;

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ctx.providerKey}` },
      body: JSON.stringify({ ...body, model: modelToUse }),
    });
  } catch (e) {
    logRequest({ orgId: ctx.orgId, projectId: ctx.projectId, modelRequested, modelUsed: modelToUse, inputTokens: 0, costUSD: 0, latencyMs: Date.now() - startMs, success: false, errorCode: "network_error" });
    return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Provider unreachable", type: "api_error" } }, { status: 502 });
  }

  const latencyMs = Date.now() - startMs;

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    return NextResponse.json(errBody, { status: upstream.status });
  }

  const data = await upstream.json();
  const inputTokens = (data.usage?.prompt_tokens as number | undefined) ?? 0;
  const costUSD = estimateCost(modelToUse, inputTokens, 0);

  logRequest({ orgId: ctx.orgId, projectId: ctx.projectId, modelRequested, modelUsed: modelToUse, inputTokens, costUSD, latencyMs, success: true });

  return NextResponse.json({ ...data, model: modelToUse }, {
    headers: {
      "x-sr-model-requested": modelRequested,
      "x-sr-model-used":      modelToUse,
      "x-sr-cost-usd":        costUSD.toFixed(8),
    },
  });
}
