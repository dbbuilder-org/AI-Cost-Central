-- Migration: Phase 5 — advanced routing columns + routing_experiments table
-- Apply via: psql $DATABASE_URL -f lib/db/migrations/0004_phase5_advanced_routing.sql

-- request_logs: add Phase 5 columns
ALTER TABLE request_logs
  ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experiment_id     TEXT,
  ADD COLUMN IF NOT EXISTS experiment_variant TEXT;

CREATE INDEX IF NOT EXISTS request_logs_experiment_idx
  ON request_logs (org_id, experiment_id)
  WHERE experiment_id IS NOT NULL;

-- routing_experiments table
CREATE TABLE IF NOT EXISTS routing_experiments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  project_id       TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  control_model    TEXT NOT NULL,
  treatment_model  TEXT NOT NULL,
  split_pct        INTEGER NOT NULL DEFAULT 50,
  task_types       TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active',  -- active|paused|concluded
  winner_variant   TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluded_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS routing_experiments_org_idx
  ON routing_experiments (org_id, status);

CREATE INDEX IF NOT EXISTS routing_experiments_project_idx
  ON routing_experiments (project_id);
