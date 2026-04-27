export interface UsageRow {
  provider: "openai" | "anthropic" | "google";
  apiKeyId: string;
  apiKeyName: string;
  model: string;
  date: string; // YYYY-MM-DD
  inputTokens: number;
  outputTokens: number;
  requests: number;
  costUSD: number;
  costPer1KInput: number;
  costPer1KOutput: number;
  // Anthropic-only: token breakdown for Claude Code fingerprint detection
  cacheReadTokens?: number;      // cache_read_input_tokens
  uncachedInputTokens?: number;  // uncached_input_tokens (excludes cache hits)
  // Provider key creation date — populated from admin API key list
  // Used by key velocity detector to catch same-day creation + usage
  providerKeyCreatedAt?: string; // YYYY-MM-DD
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  createdAt: string;
}

export interface Recommendation {
  category: "cost_reduction" | "model_migration" | "overkill" | "reporting" | "anomaly";
  finding: string;
  impact: "High" | "Medium" | "Low";
  action: string;
  effort: "Low" | "Medium" | "High";
  savings_estimate: string;
}

export interface SpendSummary {
  totalCostUSD: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: ModelSummary[];
  byApiKey: KeySummary[];
  byDay: DaySummary[];
  weeklyTrend: WeekSummary[];
}

export interface ModelSummary {
  model: string;
  provider?: "openai" | "anthropic" | "google";
  costUSD: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costPer1KInput: number;
  costPer1KOutput: number;
  // Efficiency metrics
  avgInputTokens: number;       // input tokens per request
  avgOutputTokens: number;      // output tokens per request
  avgTotalTokens: number;       // total tokens per request
  inputOutputRatio: number;     // input / output — high = context-heavy, low output
  costPerRequest: number;       // USD per request
  overkillSignal: OverkillSignal;
}

export type OverkillSignal = "none" | "low" | "medium" | "high";

export interface KeySummary {
  apiKeyId: string;
  apiKeyName: string;
  costUSD: number;
  requests: number;
  byModel: ModelSummary[];
}

export interface DaySummary {
  date: string;
  costUSD: number;
  byModel: Record<string, number>;
}

export interface WeekSummary {
  weekLabel: string;
  startDate: string;
  costUSD: number;
}

export type DateRange = "7d" | "14d" | "28d";
