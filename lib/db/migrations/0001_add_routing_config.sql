-- Migration: add routing_config to projects
-- Apply via: psql $DATABASE_URL -f lib/db/migrations/0001_add_routing_config.sql

ALTER TABLE projects ADD COLUMN IF NOT EXISTS routing_config jsonb DEFAULT '{}';

-- Backfill: set empty object for existing rows (already handled by DEFAULT)
UPDATE projects SET routing_config = '{}' WHERE routing_config IS NULL;
