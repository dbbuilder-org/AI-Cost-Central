# AICostCentral — Roadmap

## Phase 1 — OpenAI Prototype ✅ Complete
**Delivered:** Live at https://aicostcentral.servicevision.io

- [x] Next.js 15 + shadcn/ui + Recharts + Zustand + SheetJS
- [x] OpenAI Admin API: usage/completions, embeddings, costs (28d, paginated, grouped by model+key)
- [x] Project-scoped API key enumeration (`/projects/{id}/api_keys`)
- [x] Dashboard: overview cards, spend over time, cost by model/key, efficiency table
- [x] Request Efficiency tab: avg tokens/request, in:out ratio, cost/request, overkill signal per model
- [x] Claude Haiku analysis: overkill detection, model migration, anomaly, batching recommendations
- [x] Excel export (5 sheets)
- [x] Vercel deploy + custom domain + server-side env var auth (no localStorage required)
- [x] Inter font, custom tooltips with model names + $ values

---

## Phase 2 — Multi-Provider (4–6 weeks out)
- Anthropic provider: usage via `GET /v1/usage` (when available) or billing API
- Google Vertex AI: Cloud Billing API by SKU (vertex-ai-models)
- AWS Bedrock: Cost Explorer API filtered to `Amazon Bedrock` service
- Unified provider selector in dashboard
- Cross-provider model migration recommendations ("move GPT-4o batch jobs to Claude Sonnet")

---

## Phase 3 — Alerting & Forecasting (8–12 weeks out)
- Budget thresholds per API key: alert via email (Resend) or Slack webhook
- 30-day spend forecast using linear regression on 28d history
- Anomaly detection: flag days where spend > 2σ above rolling mean
- Scheduled email digest (weekly summary PDF via Puppeteer → Vercel Edge)

---

## Phase 3.5 — Repo-Linked Deep Analysis (next major feature)
**Goal:** Tie each API key to a GitHub repo so recommendations name actual files, models, and call sites.

### How it works
1. **Key → Repo mapping** — Settings UI adds a GitHub repo URL per API key (e.g. UpApply key → `dbbuilder-org/UpApply`). Stored in Vercel KV.
2. **Code scan on analysis** — When "AI Analysis" runs, for each mapped key:
   - Fetch repo file tree via GitHub API (no clone needed)
   - Search for model name strings (`gpt-4o`, `claude`, etc.) using GitHub Search Code API
   - Pull the relevant file sections (±20 lines around each hit)
3. **Context-aware Haiku prompt** — Pass spend data + code snippets together. Haiku can now say:
   - _"UpApply/api/app/services/job_analysis.py line 406 calls gpt-4o for job scoring. At 4,700 requests/28d averaging 380 tokens each, switching to gpt-4.1-nano saves ~$44/month."_
   - _"The discovery agent (rss_discovery.py) fetches and scores all RSS jobs before filtering. Add a recency+embedding pre-filter before the LLM call."_
4. **Web search augmentation** — For tools without a linked repo, use web search to identify the tool (e.g. "UpApply" → known stack) and infer likely usage patterns.
5. **Caching** — Repo scan results cached in Vercel KV with 6-hour TTL (GitHub API rate limit friendly).

### Insight from UpApply ($48.25/28d)
Real-world example that validated this approach (discovered via manual inspection 2026-04-12):
- **Root cause found in code:** `job_analysis.py:406` hardcoded `gpt-4o-mini` (now `gpt-4.1-nano`), called per-job in discovery runs
- **Cover letter drafts:** `gpt-4o` for 350-450 word output — justified, keep
- **Fix applied:** Switched scoring → `gpt-4.1-nano` (50× cheaper input tokens). Projected spend: ~$2-4/28d → ~$44 savings/month
- **Repo-linked analysis would have surfaced this automatically**

### Implementation notes
- GitHub PAT (read-only) stored in Vercel env `GITHUB_TOKEN`
- Settings page: add "Link GitHub repo" per API key with optional path filter (e.g. `api/app/services/`)
- Haiku prompt grows to ~6-8K tokens with code snippets — still well within context, cost ~$0.005/analysis run
- Privacy: only pass file excerpts containing model name strings, not full file contents

---

## Phase 4 — Team & Multi-Account (3+ months)
- Auth (Clerk or NextAuth) for multi-user access
- Per-user key vaults (encrypted at rest in Postgres/Neon)
- Role-based access: admin sees all keys, viewer sees aggregates only
- Org-level rollup across multiple OpenAI organizations
- Cost allocation tagging (map API keys to internal teams/projects)
