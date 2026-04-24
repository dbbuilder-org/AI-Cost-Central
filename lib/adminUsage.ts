/**
 * Fetches usage rows directly from provider admin APIs using env-var keys.
 * DB-free — works without any org records in the database.
 *
 * Used by /api/cron/daily-digest which runs before org onboarding is complete,
 * and by any context where the full multi-tenant DB pipeline is unavailable.
 *
 * Providers supported: OpenAI (admin key), Anthropic (admin key), Google (service account JSON).
 */

import { transformOpenAI, type OAIRawData } from "@/lib/transform";
import type { UsageRow } from "@/types";
import { GoogleAuth } from "google-auth-library";

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

// ── Google helpers ─────────────────────────────────────────────────────────

const GOOGLE_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-3.1-pro-preview":        { input: 4.00,   output: 18.00 },
  "gemini-3.1-flash-lite-preview": { input: 0.25,   output: 1.50  },
  "gemini-3-pro-preview":          { input: 4.00,   output: 18.00 },
  "gemini-3-flash-preview":        { input: 0.50,   output: 3.00  },
  "gemini-2.5-pro":                { input: 1.25,   output: 10.00 },
  "gemini-2.5-flash":              { input: 0.30,   output: 2.50  },
  "gemini-2.5-flash-lite":         { input: 0.10,   output: 0.40  },
  "gemini-2.0-flash":              { input: 0.10,   output: 0.40  },
  "gemini-2.0-flash-lite":         { input: 0.075,  output: 0.30  },
  "gemini-1.5-pro":                { input: 1.25,   output: 5.00  },
  "gemini-1.5-flash":              { input: 0.075,  output: 0.30  },
  "gemini-1.5-flash-8b":           { input: 0.0375, output: 0.15  },
  "veo-3.1":                       { input: 0,      output: 0     },
  "veo-3.0":                       { input: 0,      output: 0     },
  "veo-2.0":                       { input: 0,      output: 0     },
  "imagen-4.0":                    { input: 0,      output: 0     },
  "gemini-embedding":              { input: 0.15,   output: 0     },
};

const IMAGE_MODEL_PATTERNS = ["image", "imagen", "veo", "vision", "photo", "preview-image", "flash-image"];

function isImageModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return IMAGE_MODEL_PATTERNS.some((p) => lower.includes(p));
}

function estimateInputTokens(modelId: string, outputTokens: number): number {
  return isImageModel(modelId) ? Math.round(outputTokens * 0.02) : outputTokens;
}

function calcGoogleCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const exact = GOOGLE_PRICING[modelId];
  const p = exact ?? GOOGLE_PRICING[Object.keys(GOOGLE_PRICING).find((k) => modelId.startsWith(k)) ?? ""];
  if (!p) return 0;
  return (p.input / 1_000_000) * inputTokens + (p.output / 1_000_000) * outputTokens;
}

interface TimeSeriesPoint {
  interval: { startTime: string; endTime: string };
  value: { int64Value?: string; doubleValue?: number };
}
interface TimeSeries {
  metric: { labels: Record<string, string> };
  resource: { labels: Record<string, string> };
  points: TimeSeriesPoint[];
}

async function googleQueryMonitoring(
  token: string,
  projectId: string,
  metricType: string,
  startTime: string,
  endTime: string
): Promise<TimeSeries[]> {
  const params = new URLSearchParams({
    filter: `metric.type="${metricType}"`,
    "interval.startTime": startTime,
    "interval.endTime": endTime,
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.groupByFields": "metric.labels.model",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const res = await fetch(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) return [];
  const data = await res.json() as { timeSeries?: TimeSeries[] };
  return data.timeSeries ?? [];
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchGoogleRows(days: number): Promise<UsageRow[]> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return [];

  let sa: { project_id: string };
  try {
    sa = JSON.parse(saJson);
  } catch {
    console.error("[adminUsage/google] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return [];
  }

  const projectId = sa.project_id;
  const startTime = daysAgoIso(days);
  const endTime = new Date().toISOString();

  let accessToken: string;
  try {
    const auth = new GoogleAuth({
      credentials: sa as never,
      scopes: [
        "https://www.googleapis.com/auth/monitoring.read",
        "https://www.googleapis.com/auth/cloud-platform",
      ],
    });
    const client = await auth.getClient();
    const tok = await client.getAccessToken();
    if (!tok.token) throw new Error("empty token");
    accessToken = tok.token;
  } catch (e) {
    console.error("[adminUsage/google] auth failed:", e instanceof Error ? e.message : e);
    return [];
  }

  try {
    const outputTokenSeries = await googleQueryMonitoring(
      accessToken,
      projectId,
      "generativelanguage.googleapis.com/generate_content_usage_output_token_count",
      startTime,
      endTime
    );

    const aggregated: Record<string, { date: string; model: string; inputTokens: number; outputTokens: number; costUSD: number }> = {};

    for (const ts of outputTokenSeries) {
      const model = ts.metric.labels?.model ?? "unknown";
      for (const pt of ts.points) {
        const date = pt.interval.endTime.slice(0, 10);
        const value = parseInt(pt.value.int64Value ?? "0") || (pt.value.doubleValue ?? 0);
        const key = `${date}|${model}`;
        if (!aggregated[key]) aggregated[key] = { date, model, inputTokens: 0, outputTokens: 0, costUSD: 0 };
        aggregated[key].outputTokens += value;
      }
    }

    for (const row of Object.values(aggregated)) {
      row.inputTokens = estimateInputTokens(row.model, row.outputTokens);
      row.costUSD = calcGoogleCost(row.model, row.inputTokens, row.outputTokens);
    }

    return Object.values(aggregated).map((row): UsageRow => ({
      provider: "google",
      apiKeyId: "google-ai-studio",
      apiKeyName: "Google AI Studio",
      model: row.model,
      date: row.date,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      requests: 0,
      costUSD: row.costUSD,
      costPer1KInput: 0,
      costPer1KOutput: 0,
    }));
  } catch (e) {
    console.error("[adminUsage/google]", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch N days of usage rows from all configured providers.
 * Falls back gracefully if a provider key is missing or the API errors.
 */
export async function fetchAdminUsageRows(days = 14): Promise<UsageRow[]> {
  const [openaiRows, anthropicRows, googleRows] = await Promise.all([
    fetchOpenAIRows(days),
    fetchAnthropicRows(days),
    fetchGoogleRows(days),
  ]);
  return [...openaiRows, ...anthropicRows, ...googleRows];
}
