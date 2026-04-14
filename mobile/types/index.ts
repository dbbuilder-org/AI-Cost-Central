export type Provider = "openai" | "anthropic" | "google";
export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType = "cost_spike" | "cost_drop" | "volume_spike" | "new_model" | "new_key";
export type DateRange = "7d" | "14d" | "28d";

export interface DaySpend {
  date: string;      // YYYY-MM-DD
  costUSD: number;
}

export interface ModelSpend {
  model: string;
  provider?: Provider;
  costUSD: number;
  requests: number;
}

export interface DashboardSummary {
  totalCostUSD: number;
  totalRequests: number;
  changePct: number;
  byDay: DaySpend[];
  byModel: ModelSpend[];
  periodDays: number;
  fetchedAt: string;
}

export interface MobileAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  provider: string;
  subject: string;
  message: string;
  detail: string;
  investigateSteps: string[];
  value: number;
  baseline: number;
  changePct: number;
  detectedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  provider: Provider;
  status: "active" | "archived";
  createdAt: string;
  hint?: string;
  spend7d?: number;
  spend28d?: number;
  lastSeen?: string;
  isNew: boolean;
}

export interface Settings {
  apiBaseUrl: string;
  pushEnabled: boolean;
  pushToken: string | null;
  dateRange: DateRange;
  notifyOnCritical: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: "",
  pushEnabled: false,
  pushToken: null,
  dateRange: "28d",
  notifyOnCritical: true,
  notifyOnWarning: true,
  notifyOnInfo: false,
};
