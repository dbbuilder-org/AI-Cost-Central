import type { UsageRow, SpendSummary, ModelSummary, KeySummary, DaySummary, WeekSummary } from "@/types";

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
  const modelMap = new Map<string, ModelSummary>();
  for (const r of filtered) {
    const m = modelMap.get(r.model) ?? {
      model: r.model, costUSD: 0, requests: 0,
      inputTokens: 0, outputTokens: 0, costPer1KInput: 0, costPer1KOutput: 0,
    };
    m.costUSD += r.costUSD;
    m.requests += r.requests;
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    modelMap.set(r.model, m);
  }
  const byModel = Array.from(modelMap.values()).map((m) => ({
    ...m,
    costPer1KInput: m.inputTokens > 0 ? (m.costUSD / m.inputTokens) * 1000 : 0,
    costPer1KOutput: m.outputTokens > 0 ? (m.costUSD / m.outputTokens) * 1000 : 0,
  })).sort((a, b) => b.costUSD - a.costUSD);

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
    const km = new Map<string, ModelSummary>();
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
    keySummary.byModel = Array.from(km.values()).sort((a, b) => b.costUSD - a.costUSD);
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
