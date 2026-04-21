/**
 * Fetches usage rows directly from provider admin APIs using env-var keys.
 * DB-free — works without any org records in the database.
 *
 * Used by /api/cron/daily-digest which runs before org onboarding is complete,
 * and by any context where the full multi-tenant DB pipeline is unavailable.
 *
 * Providers supported: OpenAI (admin key), Anthropic (admin key).
 * Google is omitted — its service account setup is more complex and usage
 * is low enough that OpenAI + Anthropic covers the anomaly detection need.
 */

import { transformOpenAI, type OAIRawData } from "@/lib/transform";
import type { UsageRow } from "@/types";

const OAI_BASE = "https://api.openai.com/v1/organization";

// ── OpenAI helpers (mirrors openai/usage/route.ts without auth) ────────────

async function oaiGet(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `OpenAI API ${res.status}: ${url}`);
  }
  return res.json();
}

async function oaiPaginate(url: string, token: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let nextPage: string | null = null;
  do {
    const fullUrl = nextPage ? `${url}&page=${encodeURIComponent(nextPage)}` : url;
    const data = await oaiGet(fullUrl, token) as { data?: unknown[]; has_more?: boolean; next_page?: string };
    items.push(...(data.data ?? []));
    nextPage = data.has_more && data.next_page ? data.next_page : null;
  } while (nextPage);
  return items;
}

async function oaiFetchKeyNames(token: string): Promise<Record<string, string>> {
  const keyNames: Record<string, string> = {};

  // 1. Org-level API keys (not tied to a project)
  try {
    const orgKeys = await oaiGet(`${OAI_BASE}/api_keys?limit=100`, token) as { data?: { id: string; name: string }[] };
    for (const k of orgKeys.data ?? []) {
      keyNames[k.id] = k.name;
    }
  } catch {
    // endpoint may not exist on all plans — ignore
  }

  // 2. Per-project keys (active projects)
  let projectsData: { data?: { id: string; name: string; status?: string }[] };
  try {
    projectsData = await oaiGet(`${OAI_BASE}/projects?limit=100&include_archived=true`, token) as typeof projectsData;
  } catch {
    return keyNames;
  }
  const projects = projectsData.data ?? [];
  await Promise.all(
    projects.map(async (proj) => {
      try {
        const d = await oaiGet(`${OAI_BASE}/projects/${proj.id}/api_keys?limit=100`, token) as { data?: { id: string; name: string }[] };
        for (const k of d.data ?? []) {
          // Don't overwrite if we already have a name from org-level lookup
          if (!keyNames[k.id]) {
            keyNames[k.id] = `${k.name} (${proj.name})`;
          }
        }
      } catch {
        // skip projects that error
      }
    })
  );
  return keyNames;
}

async function fetchOpenAIRows(days: number): Promise<UsageRow[]> {
  const token = process.env.OPENAI_ADMIN_KEY;
  if (!token) return [];

  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86_400;

  // OpenAI usage API: max 31 buckets per call at 1d width
  const usageParams = `start_time=${start}&end_time=${now}&limit=31&bucket_width=1d&group_by[]=model&group_by[]=api_key_id`;
  const costParams = `start_time=${start}&end_time=${now}&limit=31&bucket_width=1d`;

  try {
    const [completionBuckets, embeddingBuckets, costBuckets, keyNames] = await Promise.all([
      oaiPaginate(`${OAI_BASE}/usage/completions?${usageParams}`, token),
      oaiPaginate(`${OAI_BASE}/usage/embeddings?${usageParams}`, token),
      oaiPaginate(`${OAI_BASE}/costs?${costParams}`, token),
      oaiFetchKeyNames(token),
    ]);

    const raw: OAIRawData = {
      completionBuckets: completionBuckets as OAIRawData["completionBuckets"],
      embeddingBuckets:  embeddingBuckets  as OAIRawData["embeddingBuckets"],
      costBuckets:       costBuckets       as OAIRawData["costBuckets"],
      keyNames,
    };

    return transformOpenAI(raw);
  } catch (e) {
    console.error("[adminUsage/openai]", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Anthropic helpers ──────────────────────────────────────────────────────

interface AnthropicUsageEntry {
  timestamp: string;      // ISO date
  model: string;
  api_key_id: string;
  api_key_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
}

async function fetchAnthropicRows(days: number): Promise<UsageRow[]> {
  const token = process.env.ANTHROPIC_ADMIN_KEY;
  if (!token) return [];

  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - days);
  const startStr = startDate.toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `https://api.anthropic.com/v1/organizations/usage?start_date=${startStr}&granularity=daily&limit=100`,
      {
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": token,
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) return [];

    const data = await res.json() as { data?: AnthropicUsageEntry[] };
    const entries = data.data ?? [];

    return entries.map((e): UsageRow => ({
      provider: "anthropic",
      apiKeyId: e.api_key_id,
      apiKeyName: e.api_key_name,
      model: e.model,
      date: e.timestamp.slice(0, 10),
      inputTokens: e.input_tokens + e.cache_read_input_tokens,
      outputTokens: e.output_tokens,
      requests: 0, // Anthropic usage API doesn't return request counts
      costUSD: e.cost_usd ?? 0,
      costPer1KInput: 0,
      costPer1KOutput: 0,
    }));
  } catch (e) {
    console.error("[adminUsage/anthropic]", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch N days of usage rows from all configured providers.
 * Falls back gracefully if a provider key is missing or the API errors.
 */
export async function fetchAdminUsageRows(days = 14): Promise<UsageRow[]> {
  const [openaiRows, anthropicRows] = await Promise.all([
    fetchOpenAIRows(days),
    fetchAnthropicRows(days),
  ]);
  return [...openaiRows, ...anthropicRows];
}
