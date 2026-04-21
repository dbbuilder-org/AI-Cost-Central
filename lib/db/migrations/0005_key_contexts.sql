-- Migration: 0005_key_contexts
-- Adds key_contexts and key_documents tables for API key annotation feature.
-- Apply: psql $DATABASE_URL -f lib/db/migrations/0005_key_contexts.sql

CREATE TABLE IF NOT EXISTS key_contexts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key_id TEXT      NOT NULL,
  provider      TEXT        NOT NULL,
  display_name  TEXT,
  purpose       TEXT,
  github_repos  TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS key_contexts_org_key_uniq
  ON key_contexts(org_id, provider_key_id);

CREATE INDEX IF NOT EXISTS key_contexts_org_idx
  ON key_contexts(org_id);

CREATE TABLE IF NOT EXISTS key_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key_id TEXT        NOT NULL,
  blob_url        TEXT        NOT NULL,
  file_name       TEXT        NOT NULL,
  file_size       INTEGER,
  mime_type       TEXT,
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS key_documents_key_idx
  ON key_documents(org_id, provider_key_id);
