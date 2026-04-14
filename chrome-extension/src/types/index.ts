export interface ApiKey {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google";
  status: "active" | "archived";
  createdAt: string;
  hint?: string;
  spend7d?: number;
  spend28d?: number;
  lastSeen?: string;
  isNew?: boolean;
}

export interface Alert {
  id: string;
  type: "new_model" | "cost_spike" | "volume_spike" | "cost_drop" | "new_key";
  severity: "critical" | "warning" | "info";
  provider: string;
  subject: string;
  message: string;
  detail: string;
  value: number;
  baseline: number;
  changePct: number;
  detectedAt: string;
  investigateSteps: string[];
}

export interface KeyMetadata {
  renewalDate?: string;
  projectName?: string;
  notes?: string;
}

export interface Settings {
  apiBaseUrl: string;
  namingTemplate: string;
  renewalWarnDays: number;
  alertEmailTo: string;
}

export interface StoredState {
  settings: Settings;
  keyMetadata: Record<string, KeyMetadata>;
  lastSeenKeyIds: string[];
  lastAlertIds: string[];
  recentAlerts: Alert[];
  recentKeys: ApiKey[];
  lastFetch?: string;
}
