-- Migration: add model_pricing and org_webhooks tables
-- Apply via: psql $DATABASE_URL -f lib/db/migrations/0002_add_pricing_and_webhooks.sql

CREATE TABLE IF NOT EXISTS model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  display_name TEXT,
  input_per_1m NUMERIC(12, 6) NOT NULL,
  output_per_1m NUMERIC(12, 6) NOT NULL,
  cache_read_per_1m NUMERIC(12, 6),
  context_window INTEGER,
  max_output_tokens INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS model_pricing_model_id_idx ON model_pricing (model_id);
CREATE INDEX IF NOT EXISTS model_pricing_provider_idx ON model_pricing (provider);

CREATE TABLE IF NOT EXISTS org_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_delivered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_webhooks_org_idx ON org_webhooks (org_id);
