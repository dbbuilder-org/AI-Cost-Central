# AICostCentral — Roadmap

## Phase 1 — OpenAI Prototype (Current Sprint)
**Goal:** Working dashboard for OpenAI spend with Excel export and Haiku recommendations.

- [x] Requirements, Architecture, Roadmap docs
- [ ] Next.js 15 project scaffold (shadcn, Tailwind, Recharts, Zustand, SheetJS)
- [ ] Settings page: enter/save/mask OpenAI Admin key
- [ ] `/api/openai/usage` proxy route — fetch 28d completions + embeddings + costs
- [ ] `/api/openai/keys` proxy route — list key names
- [ ] Data transform layer → unified `UsageRow[]`
- [ ] Dashboard: Overview cards (total spend, top model, top key, WoW delta)
- [ ] Dashboard: Spend over time stacked area chart (daily, by model)
- [ ] Dashboard: Cost by model horizontal bar chart
- [ ] Dashboard: Cost by API key horizontal bar chart
- [ ] Dashboard: Model efficiency table ($/1K tokens)
- [ ] Date range filter (7d / 14d / 28d)
- [ ] Excel export (4 sheets)
- [ ] `/api/analyze` route — Claude Haiku recommendations
- [ ] Recommendation cards UI
- [ ] Vercel KV caching + Vercel Cron daily refresh
- [ ] Deploy to Vercel

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

## Phase 4 — Team & Multi-Account (3+ months)
- Auth (Clerk or NextAuth) for multi-user access
- Per-user key vaults (encrypted at rest in Postgres/Neon)
- Role-based access: admin sees all keys, viewer sees aggregates only
- Org-level rollup across multiple OpenAI organizations
- Cost allocation tagging (map API keys to internal teams/projects)
