/**
 * POST /v1/embeddings — OpenAI-compatible embeddings passthrough.
 * Phase 1: forwards to OpenAI. Phase 2: route to cheapest embedding model.
 */
import { NextRequest, NextResponse } from "next/server";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

function resolveKey(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const raw = authHeader.replace("Bearer ", "");

  if (raw.startsWith("sk-sr-")) {
    const masterKey = process.env.SMARTROUTER_MASTER_KEY;
    if (masterKey && raw === masterKey) {
      return process.env.OPENAI_API_KEY ?? null;
    }
    return null;
  }

  if (raw.startsWith("sk-") || raw.startsWith("sk-proj-") || raw.startsWith("sk-admin-")) {
    return raw;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const providerKey = resolveKey(req.headers.get("authorization"));

  if (!providerKey) {
    return NextResponse.json(
      { error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${providerKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Provider unreachable", type: "api_error" } },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
