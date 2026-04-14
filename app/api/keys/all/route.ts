/**
 * GET /api/keys/all
 *
 * Returns a unified list of API keys across all providers with metadata.
 * Used by the AICostCentral Chrome extension for key health monitoring.
 *
 * Aggregates:
 *  - OpenAI: project api_keys endpoint
 *  - Anthropic: /v1/organizations/api_keys
 *  - Google: single virtual entry (no per-key listing available)
 */

import { NextResponse } from "next/server";

export interface UnifiedKey {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google";
  status: "active" | "archived";
  createdAt: string;
  hint?: string;           // partial key hint (last chars)
  spend7d?: number;        // USD, from usage rows
  spend28d?: number;       // USD
  lastSeen?: string;       // YYYY-MM-DD
  isNew: boolean;          // created in last 3 days
}

const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

async function fetchAnthropicKeys(adminKey: string): Promise<UnifiedKey[]> {
  const keys: UnifiedKey[] = [];
  let after: string | null = null;
  const cutoff3d = new Date(Date.now() - 3 * 86400_000).toISOString();

  do {
    const url = `${ANTHROPIC_BASE}/v1/organizations/api_keys?limit=100${after ? `&after=${after}` : ""}`;
    const res = await fetch(url, {
      headers: { "x-api-key": adminKey, "anthropic-version": ANTHROPIC_VERSION },
    });
    if (!res.ok) break;
    const data = await res.json() as {
      data: { id: string; name: string; status: string; created_at: string; partial_key_hint?: string }[];
      has_more: boolean;
      last_id?: string;
    };

    for (const k of data.data) {
      keys.push({
        id: k.id,
        name: k.name,
        provider: "anthropic",
        status: k.status === "active" ? "active" : "archived",
        createdAt: k.created_at,
        hint: k.partial_key_hint,
        isNew: k.created_at > cutoff3d,
      });
    }
    after = data.has_more && data.last_id ? data.last_id : null;
  } while (after);

  return keys;
}

async function fetchOpenAIKeys(adminKey: string): Promise<UnifiedKey[]> {
  const keys: UnifiedKey[] = [];
  const cutoff3d = new Date(Date.now() - 3 * 86400_000).toISOString();

  // Get all projects first
  const projRes = await fetch("https://api.openai.com/v1/organization/projects?limit=100", {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!projRes.ok) return keys;
  const projData = await projRes.json() as { data: { id: string; name: string }[] };

  await Promise.all(
    projData.data.map(async (proj) => {
      const keyRes = await fetch(
        `https://api.openai.com/v1/organization/projects/${proj.id}/api_keys?limit=100`,
        { headers: { Authorization: `Bearer ${adminKey}` } }
      );
      if (!keyRes.ok) return;
      const keyData = await keyRes.json() as {
        data: { id: string; name: string; created_at: number; redacted_value?: string }[];
      };

      for (const k of keyData.data) {
        const createdAt = new Date(k.created_at * 1000).toISOString();
        keys.push({
          id: k.id,
          name: `${k.name} (${proj.name})`,
          provider: "openai",
          status: "active",
          createdAt,
          hint: k.redacted_value,
          isNew: createdAt > cutoff3d,
        });
      }
    })
  );

  return keys;
}

export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_ADMIN_KEY;
  const openaiKey = process.env.OPENAI_ADMIN_KEY;

  const [anthropicKeys, openaiKeys] = await Promise.allSettled([
    anthropicKey ? fetchAnthropicKeys(anthropicKey) : Promise.resolve([]),
    openaiKey ? fetchOpenAIKeys(openaiKey) : Promise.resolve([]),
  ]);

  const keys: UnifiedKey[] = [
    ...(anthropicKeys.status === "fulfilled" ? anthropicKeys.value : []),
    ...(openaiKeys.status === "fulfilled" ? openaiKeys.value : []),
    // Google: single virtual entry (no per-key API for AI Studio)
    {
      id: "google",
      name: "Google (Gemini AI Studio)",
      provider: "google",
      status: "active",
      createdAt: new Date(0).toISOString(),
      isNew: false,
    },
  ];

  // Sort: new keys first, then by provider, then by name
  keys.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(keys);
}
