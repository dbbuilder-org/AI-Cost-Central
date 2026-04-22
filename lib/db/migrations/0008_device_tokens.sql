-- Migration 0008: Device tokens for mobile push + SMS, plus enrichment tracking
-- device_tokens: stores Expo push tokens and optional SMS phone numbers
-- key_alerts: add ai_enriched + notified_at for hourly vs daily-digest separation

CREATE TABLE IF NOT EXISTS device_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text        NOT NULL,
  platform        text,
  phone           text,
  notify_on_critical  boolean NOT NULL DEFAULT true,
  notify_on_warning   boolean NOT NULL DEFAULT true,
  notify_on_info      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_idx ON device_tokens (token);

ALTER TABLE key_alerts
  ADD COLUMN IF NOT EXISTS ai_enriched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;
