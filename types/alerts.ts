export type AlertType =
  | "cost_spike"    // daily cost > 2.5σ above baseline AND +50%
  | "cost_drop"     // daily cost drops to <15% of baseline (broken integration)
  | "volume_spike"  // request count > 3× baseline
  | "new_model"     // model first appears in last 7d, not in prior 21d
  | "new_key";      // API key first seen in last 3 days

export type AlertSeverity = "critical" | "warning" | "info";

/** Raw detection result before AI enrichment */
export interface DetectionResult {
  type: AlertType;
  severity: AlertSeverity;
  provider: string;
  subject: string;          // model name or key display name
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
  minBaselineCost: number;      // ignore models with baseline < this, default 0.50
  newModelLookbackDays: number; // days to scan for "no prior use", default 21
  newKeyLookbackDays: number;   // days a key is considered "new", default 3
  minBaselineDays: number;      // need at least this many days for baseline, default 7
}

export const DEFAULT_CONFIG: AlertConfig = {
  spikeZScore: 2.5,
  spikeMinPct: 50,
  dropMaxPctOfBaseline: 15,
  minBaselineCost: 0.50,
  newModelLookbackDays: 21,
  newKeyLookbackDays: 3,
  minBaselineDays: 7,
};
