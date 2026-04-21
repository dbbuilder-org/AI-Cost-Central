-- Migration 0006: Add code scan cache columns to key_contexts
-- Stores the result of GitHub repo scanning so we don't re-scan on every cron run.
-- code_scan_json holds a CodeScanSummary (see lib/codeScanning/index.ts).
-- code_scan_at tracks when the last scan ran; fresh = within 12 hours.

ALTER TABLE key_contexts
  ADD COLUMN IF NOT EXISTS code_scan_json  jsonb,
  ADD COLUMN IF NOT EXISTS code_scan_at    timestamptz;
