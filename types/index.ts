export interface UsageRow {
  provider: "openai";
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
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  createdAt: string;
}

export interface Recommendation {
  category: "cost_reduction" | "model_migration" | "reporting" | "anomaly";
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
  costUSD: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costPer1KInput: number;
  costPer1KOutput: number;
}

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
