-- Migration: add callsite column to request_logs (Phase 3 code attribution)
-- Apply via: psql $DATABASE_URL -f lib/db/migrations/0003_add_callsite.sql

ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS callsite TEXT;
CREATE INDEX IF NOT EXISTS request_logs_callsite_idx ON request_logs (org_id, callsite)
  WHERE callsite IS NOT NULL;
