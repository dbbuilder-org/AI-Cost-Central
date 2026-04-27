import type { UsageRow, SpendSummary, ModelSummary, KeySummary, DaySummary, WeekSummary, OverkillSignal } from "@/types";

interface OAIUsageBucket {
  start_time: number;
  results: OAIUsageResult[];
}

interface OAIUsageResult {
  input_tokens?: number;
  input_cached_tokens?: number;
  output_tokens?: number;
  num_model_requests: number;
  api_key_id: string | null;
  model: string | null;
}

interface OAICostBucket {
  start_time: number;
  results: OAICostResult[];
}

interface OAICostResult {
  amount: { value: string | number; currency: string };
  line_item: string | null;
}

export interface OAIRawData {
  completionBuckets: OAIUsageBucket[];
  embeddingBuckets: OAIUsageBucket[];
  costBuckets: OAICostBucket[];
  keyNames: Record<string, string>;
}

function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/**
 * Approximate per-token pricing ($ per 1M tokens) used to weight cost distribution.
 * Exact values don't matter — ratios matter. The OpenAI costs API provides the true
 * daily total; we use these weights only to split that total across keys/models.
 *
 * Prefixes are matched longest-first so e.g. "gpt-4o-mini" beats "gpt-4o".
 */
const MODEL_PRICE_WEIGHTS: Array<{ prefix: string; input: number; output: number }> = [
  // GPT-5 family (2026)
  { prefix: "gpt-5.5",          input: 30,   output: 60   },
  { prefix: "gpt-5.4-mini",     input: 2,    output: 8    },
  { prefix: "gpt-5.4",          input: 20,   output: 50   },
  { prefix: "gpt-5.3-codex",    input: 15,   output: 40   },
  { prefix: "gpt-5.3",          input: 15,   output: 40   },
  { prefix: "gpt-5-nano",       input: 0.5,  output: 2    },
  { prefix: "gpt-5",            input: 20,   output: 50   },
  // o-series
  { prefix: "o4-mini",          input: 1.10, output: 4.40 },
  { prefix: "o3-mini",          input: 1.10, output: 4.40 },
  { prefix: "o3",               input: 10,   output: 40   },
  { prefix: "o1-mini",          input: 3,    output: 12   },
  { prefix: "o1",               input: 15,   output: 60   },
  // GPT-4.1 family (2025)
  { prefix: "gpt-4.1-nano",     input: 0.10, output: 0.40 },
  { prefix: "gpt-4.1-mini",     input: 0.40, output: 1.60 },
  { prefix: "gpt-4.1",          input: 2,    output: 8    },
  // GPT-4o family
  { prefix: "gpt-4o-mini",      input: 0.15, output: 0.60 },
  { prefix: "gpt-4o",           input: 2.50, output: 10   },
  // GPT-4 / GPT-3.5
  { prefix: "gpt-4-turbo",      input: 10,   output: 30   },
  { prefix: "gpt-4",            input: 30,   output: 60   },
  { prefix: "gpt-3.5-turbo",    input: 0.50, output: 1.50 },
  // Embeddings / misc
  { prefix: "text-embedding",   input: 0.10, output: 0    },
  { prefix: "whisper",          input: 0,    output: 0    },
  { prefix: "tts",              input: 0,    output: 0    },
  { prefix: "dall-e",           input: 0,    output: 0    },
];
const MODEL_PRICE_FALLBACK = { input: 5, output: 15 };

function modelPriceWeight(model: string): number {
  const lower = model.toLowerCase();
  // Match longest prefix first (array is ordered longest-to-shortest within families)
  for (const entry of MODEL_PRICE_WEIGHTS) {
    if (lower.startsWith(entry.prefix.toLowerCase())) {
      return entry.input + entry.output;
    }
  }
  return MODEL_PRICE_FALLBACK.input + MODEL_PRICE_FALLBACK.output;
}

/**
 * Compute a token-weighted cost estimate for a usage row.
 * Used as the weight for distributing the actual OpenAI daily cost total.
 * Cached input tokens are discounted (50%) since OpenAI charges less for them.
 */
function estimatedCostWeight(row: UsageRow & { inputWeight: number }): number {
  const pricePerM = modelPriceWeight(row.model);
  // Output tokens are ~4x more expensive per token than input on most models
  return (row.inputWeight * (pricePerM * 0.25) + row.outputTokens * (pricePerM * 0.75)) / 1_000_000;
}

export function transformOpenAI(raw: OAIRawData): UsageRow[] {
  // Build cost-by-day from the OpenAI costs API (org-level actuals)
  const costByDay: Record<string, number> = {};
  for (const bucket of raw.costBuckets) {
    const date = tsToDate(bucket.start_time);
    for (const r of bucket.results) {
      const amt = typeof r.amount.value === "string" ? parseFloat(r.amount.value) : r.amount.value;
      if (!isNaN(amt)) costByDay[date] = (costByDay[date] ?? 0) + amt;
    }
  }

  // Aggregate usage rows — grouped by model + api_key_id
  const rowMap = new Map<string, UsageRow & { cachedInputTokens: number; inputWeight: number }>();

  const processBucket = (bucket: OAIUsageBucket) => {
    const date = tsToDate(bucket.start_time);
    for (const r of bucket.results) {
      // Skip zero-token rows — these are rejected/rate-limited requests that
      // never consumed tokens (quota exhausted, auth failure, etc.)
      if ((r.input_tokens ?? 0) === 0 && (r.output_tokens ?? 0) === 0) continue;

      const keyId = r.api_key_id ?? "org";
      const model = r.model ?? "unknown";
      const mapKey = `${keyId}|${model}|${date}`;

      const existing = rowMap.get(mapKey) ?? {
        provider: "openai" as const,
        apiKeyId: keyId,
        apiKeyName: raw.keyNames[keyId] ?? (keyId === "org" ? "Org (unattributed)" : `key_…${keyId.slice(-8)}`),
        model,
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        costUSD: 0,
        costPer1KInput: 0,
        costPer1KOutput: 0,
        cachedInputTokens: 0,
        inputWeight: 0,
      };

      const inputTok = r.input_tokens ?? 0;
      const cachedTok = r.input_cached_tokens ?? 0;
      existing.inputTokens += inputTok;
      existing.outputTokens += r.output_tokens ?? 0;
      existing.requests += r.num_model_requests;
      existing.cachedInputTokens += cachedTok;
      // Cached tokens are 50% price — weight uncached full + cached half
      existing.inputWeight += (inputTok - cachedTok) + cachedTok * 0.5;
      rowMap.set(mapKey, existing);
    }
  };

  for (const b of raw.completionBuckets) processBucket(b);
  for (const b of raw.embeddingBuckets) processBucket(b);

  // Distribute daily cost proportionally by token-weighted model cost estimate.
  // This correctly attributes expensive GPT-5 requests vs cheap gpt-4o-mini requests
  // instead of treating every request as equal value.
  const byDate: Record<string, Array<UsageRow & { cachedInputTokens: number; inputWeight: number }>> = {};
  for (const row of rowMap.values()) {
    (byDate[row.date] ??= []).push(row);
  }

  for (const [date, dateRows] of Object.entries(byDate)) {
    const dayCost = costByDay[date] ?? 0;
    const totalWeight = dateRows.reduce((s, r) => s + estimatedCostWeight(r), 0);
    for (const row of dateRows) {
      const rowWeight = estimatedCostWeight(row);
      // Fall back to request-count distribution only if all rows have zero token weight
      row.costUSD = totalWeight > 0
        ? dayCost * (rowWeight / totalWeight)
        : dateRows.reduce((s, r) => s + r.requests, 0) > 0
          ? dayCost * (row.requests / dateRows.reduce((s, r) => s + r.requests, 0))
          : 0;
      row.costPer1KInput = row.inputTokens > 0 ? (row.costUSD / row.inputTokens) * 1000 : 0;
      row.costPer1KOutput = row.outputTokens > 0 ? (row.costUSD / row.outputTokens) * 1000 : 0;
    }
  }

  return Array.from(rowMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Anthropic transform ───────────────────────────────────────────────────────

interface AnthropicRow {
  date: string;
  model: string;
  apiKeyId: string;
  apiKeyName?: string;
  provider: "anthropic";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUSD: number;
}

export function transformAnthropic(rows: AnthropicRow[]): UsageRow[] {
  return rows.map((r) => {
    const totalInput = r.inputTokens + r.cacheReadTokens;
    const displayName = r.apiKeyName
      ? `Anthropic · ${r.apiKeyName}`
      : r.apiKeyId === "unknown"
      ? "Anthropic (unattributed)"
      : `Anthropic · …${r.apiKeyId.slice(-8)}`;
    return {
      provider: "anthropic" as const,
      apiKeyId: r.apiKeyId,
      apiKeyName: displayName,
      model: r.model,
      date: r.date,
      inputTokens: totalInput,
      outputTokens: r.outputTokens,
      requests: 0,
      costUSD: r.costUSD,
      costPer1KInput: totalInput > 0 ? (r.costUSD / totalInput) * 1000 : 0,
      costPer1KOutput: r.outputTokens > 0 ? (r.costUSD / r.outputTokens) * 1000 : 0,
    };
  });
}

// ── Google / Gemini transform ─────────────────────────────────────────────────

interface GoogleRow {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  costUSD: number;
  provider: "google";
}

export function transformGoogle(rows: GoogleRow[]): UsageRow[] {
  return rows.map((r) => ({
    provider: "google" as const,
    apiKeyId: "google",
    apiKeyName: "Google (Gemini)",
    model: r.model,
    date: r.date,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    requests: r.requests,
    costUSD: r.costUSD,
    costPer1KInput: r.inputTokens > 0 ? (r.costUSD / r.inputTokens) * 1000 : 0,
    costPer1KOutput: r.outputTokens > 0 ? (r.costUSD / r.outputTokens) * 1000 : 0,
  }));
}

// Model tiers: frontier models used for tiny requests are overkill candidates
const FRONTIER_MODELS = ["gpt-4o", "gpt-4.1", "gpt-4-turbo", "o1", "o3", "gpt-5"];
const CHEAP_MODELS = ["gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o-mini-2024", "gpt-4.1-mini"];

function isFrontier(model: string): boolean {
  return FRONTIER_MODELS.some((f) => model.toLowerCase().includes(f)) &&
    !CHEAP_MODELS.some((c) => model.toLowerCase().includes(c));
}

function computeOverkill(model: string, avgTotalTokens: number, avgOutput: number): OverkillSignal {
  if (!isFrontier(model)) return "none";
  // Frontier model but tiny requests → likely overkill
  if (avgTotalTokens < 300) return "high";
  if (avgTotalTokens < 800) return "medium";
  // Frontier model, very low output → simple task, probably over-engineered
  if (avgOutput < 50 && avgTotalTokens < 2000) return "medium";
  if (avgOutput < 20) return "high";
  return "low";
}

export function buildSummary(rows: UsageRow[], days: number): SpendSummary {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = rows.filter((r) => r.date >= cutoffStr);

  const totalCostUSD = filtered.reduce((s, r) => s + r.costUSD, 0);
  const totalRequests = filtered.reduce((s, r) => s + r.requests, 0);
  const totalInputTokens = filtered.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = filtered.reduce((s, r) => s + r.outputTokens, 0);

  // By model
  const modelMap = new Map<string, Omit<ModelSummary, "avgInputTokens"|"avgOutputTokens"|"avgTotalTokens"|"inputOutputRatio"|"costPerRequest"|"overkillSignal">>();
  for (const r of filtered) {
    const m = modelMap.get(r.model) ?? {
      model: r.model, provider: r.provider, costUSD: 0, requests: 0,
      inputTokens: 0, outputTokens: 0, costPer1KInput: 0, costPer1KOutput: 0,
    };
    m.costUSD += r.costUSD;
    m.requests += r.requests;
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    modelMap.set(r.model, m);
  }
  const byModel: ModelSummary[] = Array.from(modelMap.values()).map((m) => {
    const avgInput = m.requests > 0 ? m.inputTokens / m.requests : 0;
    const avgOutput = m.requests > 0 ? m.outputTokens / m.requests : 0;
    const avgTotal = avgInput + avgOutput;
    const inputOutputRatio = avgOutput > 0 ? avgInput / avgOutput : 0;
    const costPerRequest = m.requests > 0 ? m.costUSD / m.requests : 0;
    return {
      ...m,
      costPer1KInput: m.inputTokens > 0 ? (m.costUSD / m.inputTokens) * 1000 : 0,
      costPer1KOutput: m.outputTokens > 0 ? (m.costUSD / m.outputTokens) * 1000 : 0,
      avgInputTokens: Math.round(avgInput),
      avgOutputTokens: Math.round(avgOutput),
      avgTotalTokens: Math.round(avgTotal),
      inputOutputRatio: parseFloat(inputOutputRatio.toFixed(1)),
      costPerRequest,
      overkillSignal: computeOverkill(m.model, avgTotal, avgOutput),
    };
  }).sort((a, b) => b.costUSD - a.costUSD);

  // By API key
  const keyMap = new Map<string, KeySummary>();
  for (const r of filtered) {
    const k = keyMap.get(r.apiKeyId) ?? {
      apiKeyId: r.apiKeyId, apiKeyName: r.apiKeyName,
      costUSD: 0, requests: 0, byModel: [],
    };
    k.costUSD += r.costUSD;
    k.requests += r.requests;
    keyMap.set(r.apiKeyId, k);
  }
  for (const [keyId, keySummary] of keyMap.entries()) {
    const km = new Map<string, Omit<ModelSummary, "avgInputTokens"|"avgOutputTokens"|"avgTotalTokens"|"inputOutputRatio"|"costPerRequest"|"overkillSignal">>();
    for (const r of filtered.filter((r) => r.apiKeyId === keyId)) {
      const m = km.get(r.model) ?? {
        model: r.model, costUSD: 0, requests: 0,
        inputTokens: 0, outputTokens: 0, costPer1KInput: 0, costPer1KOutput: 0,
      };
      m.costUSD += r.costUSD;
      m.requests += r.requests;
      m.inputTokens += r.inputTokens;
      m.outputTokens += r.outputTokens;
      km.set(r.model, m);
    }
    keySummary.byModel = Array.from(km.values()).map((m) => {
      const avgInput = m.requests > 0 ? m.inputTokens / m.requests : 0;
      const avgOutput = m.requests > 0 ? m.outputTokens / m.requests : 0;
      return {
        ...m,
        costPer1KInput: m.inputTokens > 0 ? (m.costUSD / m.inputTokens) * 1000 : 0,
        costPer1KOutput: m.outputTokens > 0 ? (m.costUSD / m.outputTokens) * 1000 : 0,
        avgInputTokens: Math.round(avgInput),
        avgOutputTokens: Math.round(avgOutput),
        avgTotalTokens: Math.round(avgInput + avgOutput),
        inputOutputRatio: avgOutput > 0 ? parseFloat((avgInput / avgOutput).toFixed(1)) : 0,
        costPerRequest: m.requests > 0 ? m.costUSD / m.requests : 0,
        overkillSignal: computeOverkill(m.model, avgInput + avgOutput, avgOutput),
      };
    }).sort((a, b) => b.costUSD - a.costUSD);
  }
  const byApiKey = Array.from(keyMap.values()).sort((a, b) => b.costUSD - a.costUSD);

  // By day
  const dayMap = new Map<string, DaySummary>();
  for (const r of filtered) {
    const d = dayMap.get(r.date) ?? { date: r.date, costUSD: 0, byModel: {} };
    d.costUSD += r.costUSD;
    d.byModel[r.model] = (d.byModel[r.model] ?? 0) + r.costUSD;
    dayMap.set(r.date, d);
  }
  const byDay = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Weekly trend (4 weeks)
  const weeklyTrend: WeekSummary[] = [];
  for (let w = 3; w >= 0; w--) {
    const start = new Date();
    start.setDate(start.getDate() - (w + 1) * 7);
    const end = new Date();
    end.setDate(end.getDate() - w * 7);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const weekCost = filtered
      .filter((r) => r.date >= startStr && r.date < endStr)
      .reduce((s, r) => s + r.costUSD, 0);
    weeklyTrend.push({ weekLabel: `W${4 - w}`, startDate: startStr, costUSD: weekCost });
  }

  return { totalCostUSD, totalRequests, totalInputTokens, totalOutputTokens, byModel, byApiKey, byDay, weeklyTrend };
}
