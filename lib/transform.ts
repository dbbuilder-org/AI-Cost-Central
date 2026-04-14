import type { UsageRow, SpendSummary, ModelSummary, KeySummary, DaySummary, WeekSummary, OverkillSignal } from "@/types";

interface OAIUsageBucket {
  start_time: number;
  results: OAIUsageResult[];
}

interface OAIUsageResult {
  input_tokens?: number;
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

export function transformOpenAI(raw: OAIRawData): UsageRow[] {
  // Build cost-by-day (org-level total; we distribute proportionally by requests)
  const costByDay: Record<string, number> = {};
  for (const bucket of raw.costBuckets) {
    const date = tsToDate(bucket.start_time);
    for (const r of bucket.results) {
      const amt = typeof r.amount.value === "string" ? parseFloat(r.amount.value) : r.amount.value;
      if (!isNaN(amt)) costByDay[date] = (costByDay[date] ?? 0) + amt;
    }
  }

  // Aggregate usage — now grouped by model + api_key_id from the API
  const rowMap = new Map<string, UsageRow>();

  const processBucket = (bucket: OAIUsageBucket) => {
    const date = tsToDate(bucket.start_time);
    for (const r of bucket.results) {
      const keyId = r.api_key_id ?? "org";
      const model = r.model ?? "unknown";
      const mapKey = `${keyId}|${model}|${date}`;

      const existing = rowMap.get(mapKey) ?? {
        provider: "openai" as const,
        apiKeyId: keyId,
        apiKeyName: raw.keyNames[keyId] ?? (keyId === "org" ? "Org (unattributed)" : keyId),
        model,
        date,
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
        costUSD: 0,
        costPer1KInput: 0,
        costPer1KOutput: 0,
      };

      existing.inputTokens += r.input_tokens ?? 0;
      existing.outputTokens += r.output_tokens ?? 0;
      existing.requests += r.num_model_requests;
      rowMap.set(mapKey, existing);
    }
  };

  for (const b of raw.completionBuckets) processBucket(b);
  for (const b of raw.embeddingBuckets) processBucket(b);

  // Distribute daily cost proportionally by request count across all rows that day
  const byDate: Record<string, UsageRow[]> = {};
  for (const row of rowMap.values()) {
    (byDate[row.date] ??= []).push(row);
  }

  for (const [date, dateRows] of Object.entries(byDate)) {
    const totalReqs = dateRows.reduce((s, r) => s + r.requests, 0);
    const dayCost = costByDay[date] ?? 0;
    for (const row of dateRows) {
      row.costUSD = totalReqs > 0 ? dayCost * (row.requests / totalReqs) : 0;
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
