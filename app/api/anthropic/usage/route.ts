/**
 * GET /api/anthropic/usage
 *
 * Fetches 28 days of token usage from:
 *   GET /v1/organizations/usage_report/messages (grouped by model + api_key_id)
 *
 * Cost is calculated locally from token counts + our pricing catalog.
 * The cost_report endpoint was dropped — its group_by=description aggregation
 * double-counts amounts across API keys, producing wildly inflated totals.
 */
import { NextResponse } from "next/server";

const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

// Pricing in USD per 1M tokens (Apr 2026)
const ANTHROPIC_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-4-6":           { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  "claude-sonnet-4-6":         { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  "claude-sonnet-4-20250514":  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  "claude-haiku-4-5-20251001": { input:  1.00, output:  5.00, cacheRead: 0.10,  cacheWrite:  1.25 },
  "claude-haiku-4-5":          { input:  1.00, output:  5.00, cacheRead: 0.10,  cacheWrite:  1.25 },
  "claude-3-5-sonnet-20241022":{ input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  "claude-3-5-haiku-20241022": { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  "claude-3-haiku-20240307":   { input:  0.25, output:  1.25, cacheRead: 0.03,  cacheWrite:  0.30 },
  "claude-3-opus-20240229":    { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
};

function calcCost(
  model: string,
  uncachedInput: number,
  cacheRead: number,
  cacheWrite: number,
  output: number
): number {
  // Find pricing — try exact match first, then prefix
  const p = ANTHROPIC_PRICING[model] ??
    Object.entries(ANTHROPIC_PRICING).find(([k]) => model.startsWith(k))?.[1];
  if (!p) return 0;
  const M = 1_000_000;
  return (
    (p.input      / M) * uncachedInput +
    (p.cacheRead  / M) * cacheRead +
    (p.cacheWrite / M) * cacheWrite +
    (p.output     / M) * output
  );
}

function adminHeaders(key: string) {
  return {
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
    "Content-Type": "application/json",
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

interface AnthropicUsageBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageResult[];
}

interface AnthropicUsageResult {
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  output_tokens: number;
  model: string;
  api_key_id: string | null;
  workspace_id: string | null;
  service_tier: string;
}

async function fetchAllUsage(adminKey: string): Promise<AnthropicUsageBucket[]> {
  const startingAt = daysAgo(28);
  const buckets: AnthropicUsageBucket[] = [];
  let page: string | null = null;

  do {
    const params = new URLSearchParams({
      starting_at: startingAt,
      bucket_width: "1d",
      limit: "31",
    });
    params.append("group_by[]", "model");
    params.append("group_by[]", "api_key_id");
    if (page) params.set("page", page);

    const res = await fetch(`${ANTHROPIC_BASE}/v1/organizations/usage_report/messages?${params}`, {
      headers: adminHeaders(adminKey),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic usage_report/messages ${res.status}: ${body}`);
    }

    const data = await res.json() as { data: AnthropicUsageBucket[]; has_more: boolean; next_page?: string };
    buckets.push(...data.data);
    page = data.has_more ? (data.next_page ?? null) : null;
  } while (page);

  return buckets;
}

export async function GET() {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "ANTHROPIC_ADMIN_KEY not configured" }, { status: 500 });
  }

  let usageBuckets: AnthropicUsageBucket[];
  try {
    usageBuckets = await fetchAllUsage(adminKey);
  } catch (e) {
    console.error("[anthropic/usage]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fetch failed" }, { status: 502 });
  }

  // Flatten + calculate cost from token counts
  const aggregated: Record<string, {
    date: string; model: string; apiKeyId: string; provider: string;
    inputTokens: number; outputTokens: number; cacheReadTokens: number;
    cacheWriteTokens: number; costUSD: number; serviceTier: string;
  }> = {};

  for (const bucket of usageBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    for (const r of bucket.results) {
      const cacheWrite = (r.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
        (r.cache_creation?.ephemeral_1h_input_tokens ?? 0);
      const costUSD = calcCost(r.model, r.uncached_input_tokens, r.cache_read_input_tokens, cacheWrite, r.output_tokens);

      const key = `${date}|${r.model}|${r.api_key_id ?? "unknown"}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          date,
          model: r.model,
          apiKeyId: r.api_key_id ?? "unknown",
          provider: "anthropic",
          inputTokens: r.uncached_input_tokens,
          outputTokens: r.output_tokens,
          cacheReadTokens: r.cache_read_input_tokens,
          cacheWriteTokens: cacheWrite,
          costUSD,
          serviceTier: r.service_tier,
        };
      } else {
        aggregated[key].inputTokens     += r.uncached_input_tokens;
        aggregated[key].outputTokens    += r.output_tokens;
        aggregated[key].cacheReadTokens += r.cache_read_input_tokens;
        aggregated[key].cacheWriteTokens+= cacheWrite;
        aggregated[key].costUSD         += costUSD;
      }
    }
  }

  const rows = Object.values(aggregated).sort((a, b) => b.date.localeCompare(a.date));

  // Summary by model
  const byModel: Record<string, { costUSD: number; inputTokens: number; outputTokens: number }> = {};
  for (const row of rows) {
    if (!byModel[row.model]) byModel[row.model] = { costUSD: 0, inputTokens: 0, outputTokens: 0 };
    byModel[row.model].costUSD      += row.costUSD;
    byModel[row.model].inputTokens  += row.inputTokens;
    byModel[row.model].outputTokens += row.outputTokens;
  }

  return NextResponse.json({
    rows,
    summary: {
      totalCostUSD: rows.reduce((s, r) => s + r.costUSD, 0),
      byModel,
    },
    fetchedAt: new Date().toISOString(),
  });
}
