/**
 * GET /api/anthropic/usage
 *
 * Fetches 28 days of Anthropic usage from:
 *   GET /v1/organizations/usage_report/messages  (token counts by model + API key)
 *   GET /v1/organizations/cost_report            (USD costs by day)
 *
 * Returns a UsageRow[] in the same shape as /api/openai/usage so the dashboard
 * can display both providers in a unified view.
 */
import { NextResponse } from "next/server";

const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

function adminHeaders(key: string) {
  return {
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
    "Content-Type": "application/json",
  };
}

// ISO date string for N days ago at midnight UTC
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

interface AnthropicCostBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicCostResult[];
}

interface AnthropicCostResult {
  amount: string; // decimal string in USD cents
  currency: string;
  model: string;
  description: string;
  workspace_id: string | null;
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
    // Append group_by separately (URLSearchParams dedupes keys with same name)
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

async function fetchAllCosts(adminKey: string): Promise<AnthropicCostBucket[]> {
  const startingAt = daysAgo(28);
  const buckets: AnthropicCostBucket[] = [];
  let page: string | null = null;

  do {
    const params = new URLSearchParams({
      starting_at: startingAt,
      bucket_width: "1d",
      limit: "31",
      "group_by[]": "description",  // cost_report only supports description or workspace_id
    });
    if (page) params.set("page", page);

    const res = await fetch(`${ANTHROPIC_BASE}/v1/organizations/cost_report?${params}`, {
      headers: adminHeaders(adminKey),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic cost_report ${res.status}: ${body}`);
    }

    const data = await res.json() as { data: AnthropicCostBucket[]; has_more: boolean; next_page?: string };
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
  let costBuckets: AnthropicCostBucket[];

  try {
    [usageBuckets, costBuckets] = await Promise.all([
      fetchAllUsage(adminKey),
      fetchAllCosts(adminKey),
    ]);
  } catch (e) {
    console.error("[anthropic/usage]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fetch failed" }, { status: 502 });
  }

  // Build a cost lookup: date → model → USD
  // Anthropic cost amounts are in cents as decimal strings
  const costLookup: Record<string, Record<string, number>> = {};
  for (const bucket of costBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    if (!costLookup[date]) costLookup[date] = {};
    for (const r of bucket.results) {
      const usd = parseFloat(r.amount); // already in USD
      costLookup[date][r.model] = (costLookup[date][r.model] ?? 0) + usd;
    }
  }

  // Flatten usage buckets into rows
  const rows = [];
  for (const bucket of usageBuckets) {
    const date = bucket.starting_at.slice(0, 10);
    for (const r of bucket.results) {
      const totalInput = r.uncached_input_tokens + r.cache_read_input_tokens +
        (r.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
        (r.cache_creation?.ephemeral_1h_input_tokens ?? 0);
      const totalOutput = r.output_tokens;

      // Apportion cost proportionally if multiple results share a model on same day
      // (simplification: use cost_report total for this model/day)
      const dayCost = costLookup[date]?.[r.model] ?? 0;

      rows.push({
        date,
        model: r.model,
        apiKeyId: r.api_key_id ?? "unknown",
        provider: "anthropic",
        inputTokens: totalInput,
        outputTokens: totalOutput,
        requests: 1, // usage_report doesn't expose request count directly
        costUSD: dayCost,
        serviceTier: r.service_tier,
      });
    }
  }

  // Aggregate rows that share date + model + apiKeyId (from pagination overlap)
  const aggregated: Record<string, typeof rows[0]> = {};
  for (const row of rows) {
    const key = `${row.date}|${row.model}|${row.apiKeyId}`;
    if (!aggregated[key]) {
      aggregated[key] = { ...row };
    } else {
      aggregated[key].inputTokens += row.inputTokens;
      aggregated[key].outputTokens += row.outputTokens;
      aggregated[key].requests += row.requests;
      // don't double-count cost (already totaled from cost_report per day/model)
    }
  }

  const finalRows = Object.values(aggregated).sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ rows: finalRows, fetchedAt: new Date().toISOString() });
}
