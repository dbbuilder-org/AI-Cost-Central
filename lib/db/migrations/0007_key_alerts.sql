-- Migration 0007: Persist enriched anomaly alerts to DB
-- Enables idempotent cron runs: if today's alerts already exist, skip
-- expensive GitHub scan + Claude enrichment and use the cached results.
-- Also enables historical browsing of alerts in the dashboard.

CREATE TABLE IF NOT EXISTS key_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key_id text        NOT NULL,
  provider        text        NOT NULL,
  alert_type      text        NOT NULL,
  severity        text        NOT NULL,
  subject         text        NOT NULL,
  message         text        NOT NULL,
  detail          text        NOT NULL DEFAULT '',
  investigate_steps jsonb     NOT NULL DEFAULT '[]'::jsonb,
  value           numeric(12,6),
  baseline        numeric(12,6),
  change_pct      numeric(8,2),
  models          text[],
  detected_at     date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS key_alerts_dedup_idx
  ON key_alerts (provider_key_id, alert_type, detected_at);

CREATE INDEX IF NOT EXISTS key_alerts_date_idx
  ON key_alerts (detected_at DESC);
