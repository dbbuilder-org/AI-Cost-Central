# AICostCentral — Requirements

## Overview
A Vercel-hosted web app that ingests Admin API keys from major AI providers, pulls usage and cost data per API key and per model, visualizes spend, and generates AI-powered recommendations for cost reduction, model migration, and reporting improvements.

---

## Functional Requirements

### FR-01 — Credential Management
- User enters Admin API keys via a secure settings UI; keys are stored in browser localStorage (client-only, never sent to a backend server unencrypted) OR in Vercel KV behind a session token.
- Support for multiple keys per provider (org has multiple projects/API keys).
- Keys are masked in the UI after entry.
- First provider: **OpenAI** (Admin API). Subsequent: Anthropic, Google Vertex, AWS Bedrock.

### FR-02 — Data Ingestion (OpenAI Phase 1)
Pull the following via OpenAI Admin API for the **trailing 28 days** (configurable window):
- `/v1/organization/usage/completions` — token counts by model, by day
- `/v1/organization/usage/embeddings` — embedding calls by model, by day
- `/v1/organization/costs` — dollar costs bucketed by day
- `/v1/organization/api_keys` — list of API keys with names and IDs

Produce a unified data shape:
```
{
  provider, apiKeyId, apiKeyName, model, date,
  inputTokens, outputTokens, requests, costUSD
}
```

### FR-03 — Dashboard & Visualization
- **Overview cards**: Total spend (28d), top model by cost, top API key by cost, WoW change %.
- **Spend over time**: Stacked area chart by model (daily resolution).
- **Cost by model**: Horizontal bar chart sorted by cost descending.
- **Cost by API key**: Horizontal bar chart; expandable to show per-key model breakdown.
- **Model efficiency table**: $/1K tokens input, $/1K tokens output per model.
- Date range picker (7d / 14d / 28d / custom).
- Filters: by API key, by model family (GPT-4o, o-series, embeddings…).

### FR-04 — Excel Export
- "Export to Excel" button produces an `.xlsx` with multiple sheets:
  - Sheet 1: Raw daily rows (all columns)
  - Sheet 2: Summary pivot — cost by model × week
  - Sheet 3: Summary pivot — cost by API key × week
  - Sheet 4: Recommendations (text from FR-05)
- Uses `xlsx` (SheetJS) library, pure client-side, no server roundtrip.

### FR-05 — AI-Powered Recommendations
- After data loads, a "Analyze Spend" button calls Claude Haiku via the Anthropic API with a structured prompt containing the aggregated spend data.
- Haiku returns a JSON array of recommendations, each with:
  ```
  { category, finding, impact, action, effort, savings_estimate }
  ```
  Categories: `cost_reduction`, `model_migration`, `reporting`, `anomaly`.
- Recommendations rendered as cards sorted by `impact` (High / Medium / Low).
- Recommendations tab is also exported to Excel Sheet 4.

### FR-06 — Data Freshness & Caching
- On each dashboard load, check if cached data is older than **1 hour** (Vercel KV TTL or localStorage timestamp).
- If stale, re-fetch from OpenAI Admin API.
- "Refresh Now" button forces a re-fetch.
- Cron job (Vercel Cron, daily at 02:00 UTC) pre-fetches and stores the last 28 days for each configured key into Vercel KV so dashboards load instantly.

### FR-07 — Non-Functional
- All API key handling must be TLS-only; keys never appear in URLs or logs.
- p95 dashboard load < 3s with warm cache.
- Works on desktop browsers (Chrome, Firefox, Safari). Mobile-responsive layout is nice-to-have for v1.
- Accessible: WCAG 2.1 AA contrast for all charts.

---

## Out of Scope (Phase 1)
- Multi-user auth (single-user tool for internal use)
- Anthropic, Google, AWS (Phase 2+)
- Budget alerts / Slack notifications (Phase 3)
- Forecasting / ML-based anomaly detection (Phase 3)
