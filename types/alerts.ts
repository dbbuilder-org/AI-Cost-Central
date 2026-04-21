export type AlertType =
  | "cost_spike"       // API key daily cost > 2.5σ above baseline AND +50%
  | "cost_drop"        // API key daily cost drops to <15% of baseline (broken integration)
  | "volume_spike"     // API key request count > 3× baseline
  | "key_model_shift"  // API key started using a new or different model today
  | "new_key";         // API key first seen in last 3 days

export type AlertSeverity = "critical" | "warning" | "info";

/** Raw detection result before AI enrichment */
export interface DetectionResult {
  type: AlertType;
  severity: AlertSeverity;
  provider: string;
  subject: string;          // API key display name (always key-centric)
  apiKeyId?: string;        // API key ID for deduplication / linking
  models?: string[];        // models involved in this anomaly (for context)
  message: string;          // short human-readable summary
  value: number;            // current metric value
  baseline: number;         // expected/normal value
  changePct: number;        // % change from baseline (negative = drop)
}

/** Fully enriched alert (after AI analysis) */
export interface Alert extends DetectionResult {
  id: string;               // deterministic hash
  detail: string;           // AI-generated explanation
  investigateSteps: string[]; // AI-generated investigation steps
  detectedAt: string;       // ISO date YYYY-MM-DD
}

export interface AlertConfig {
  spikeZScore: number;          // z-score threshold, default 2.5
  spikeMinPct: number;          // minimum % increase to fire, default 50
  dropMaxPctOfBaseline: number; // fire if today < this% of baseline, default 15
  minBaselineCost: number;      // ignore keys whose baseline avg < this $/day, default 1.00
  minAlertDelta: number;        // minimum dollar change to fire any cost alert, default 1.00
  newKeyLookbackDays: number;   // days a key is considered "new", default 3
  minBaselineDays: number;      // need at least this many days for baseline, default 7
  modelShiftMinCost: number;    // ignore model shifts below this cost, default 0.01
}

export const DEFAULT_CONFIG: AlertConfig = {
  spikeZScore: 2.5,
  spikeMinPct: 50,
  dropMaxPctOfBaseline: 15,
  minBaselineCost: 1.00,   // whole-dollar granularity: keys spending < $1/day avg are noise
  minAlertDelta: 1.00,     // whole-dollar granularity: change must be ≥ $1 to matter
  newKeyLookbackDays: 3,
  minBaselineDays: 7,
  modelShiftMinCost: 0.01,
};
