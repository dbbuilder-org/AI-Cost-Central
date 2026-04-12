# SmartRouter — Phased Implementation Plan

## Phase 0 — Foundation (current: AICostCentral dashboard) ✅
- OpenAI Admin API spend analytics
- Request efficiency + overkill detection
- Claude Haiku recommendations
- Repo-linked analysis (Phase 3.5, in progress)

---

## Phase 1 — Proxy + Logging (MVP Router)
**Goal:** Drop-in OpenAI-compatible proxy that logs everything. No routing yet — just transparency.
**Timeline:** 2-3 weeks

### Deliverables
- `POST /v1/chat/completions` — pass-through proxy, all providers normalized to OpenAI format
- `POST /v1/embeddings` — same
- `GET /v1/models` — return catalog of supported models
- Virtual key issuance (`sk-sr-{random}`) via dashboard Settings
- BYOK: store provider keys (encrypted) per project
- Request logging → Neon Postgres
- Dashboard tab: SmartRouter — requests/day, cost/day, model breakdown, latency p50/p95
- Vercel KV: virtual key cache, budget tracking

### Does NOT include
- Routing (passthrough only: use model as requested)
- Task classification
- Recommendations from router data

### Success criteria
- Existing OpenAI SDK app works by changing only `base_url` and `api_key`
- Every request logged with model, tokens, cost, latency
- Dashboard shows 7d request history

---

## Phase 2 — Task Classification + Smart Routing
**Goal:** Automatically route to cheaper/appropriate model based on task analysis.
**Timeline:** 3-4 weeks after Phase 1

### Deliverables
- Task classifier (heuristic-first, fast, no LLM call): returns task_type + confidence
- Model quality score matrix (seeded from architecture doc, editable in dashboard)
- Routing engine: score candidates, select winner
- Routing decisions table + dashboard "Routing Decisions" tab
- Dashboard: savings counter ($X saved this month), routing breakdown pie chart
- Virtual model names: `smart-cheap`, `smart-balanced`, `smart-quality`, `smart-coding`, `smart-reasoning`
- Per-project routing rules UI: quality tier, task overrides, provider allowlist
- Budget enforcement: block/downgrade when daily/monthly ceiling hit
- Response headers: `x-sr-model-used`, `x-sr-savings-usd`, `x-sr-task-type`

### Success criteria
- 80%+ of extraction/classification requests correctly downgraded from frontier
- Avg cost reduction of 40%+ vs passing all requests to gpt-4o
- p99 routing overhead < 5ms (no LLM call in routing path)

---

## Phase 3 — Repo-Linked Attribution + Code Recommendations
**Goal:** Connect spend → routing decisions → code files. Recommendations name actual files.
**Timeline:** 2-3 weeks after Phase 2

### Deliverables
- GitHub repo link per virtual key (Settings UI)
- Code scanner: GitHub Search API finds model call sites in linked repo
- `x-sr-callsite` header: populated if app sends `X-Source-File: {file}:{line}` (convention, optional)
- Analysis route enhancement: code excerpts + routing data → Haiku → file-specific recommendations
- Dashboard: "Code Attribution" view — spend drilled down to repo/file/function
- Automated PR suggestion: Haiku drafts a GitHub PR description with the recommended model change

### Success criteria
- For UpApply: "job_analysis.py:406 — switch gpt-4o → gpt-4.1-nano, save $44/mo" surfaced automatically
- For any project with a linked repo: top 3 cost-reduction file changes identified

---

## Phase 4 — Live Pricing + Benchmark Continuous Learning
**Goal:** Pricing always current; quality scores updated from real performance data.
**Timeline:** Ongoing after Phase 2

### Deliverables
- Pricing updater cron (6h): fetches from LiteLLM pricing DB (OSS JSON) + provider APIs
- Benchmark runner: periodically evaluates models on standard tasks (MMLU subset, HumanEval, etc.)
- Quality score updates: rolling average of benchmark results, updated weekly
- "Model News" panel: when new model released, auto-evaluates and adds to catalog
- Pricing alert: notify if a model price changes > 20%

---

## Phase 5 — Multi-Provider Streaming + Advanced Routing
**Goal:** Full streaming support across all providers; advanced routing strategies.
**Timeline:** 4-6 weeks

### Deliverables
- SSE streaming normalized across all providers (OpenAI/Anthropic/Google format differences)
- Fallback chains: if primary provider times out, auto-retry on secondary
- Load balancing: round-robin across multiple provider keys (avoids rate limits)
- Latency-aware routing: factor in p95 latency per provider per model (real-time)
- A/B routing: send X% to model A, Y% to model B, compare quality metrics
- Prompt caching: detect repeated system prompts, enable provider-side caching, pass savings back

---

## Phase 6 — OpenRouter / LiteLLM Compatibility Layer
**Goal:** Act as a smarter drop-in for existing OpenRouter/LiteLLM users.
**Timeline:** After Phase 5 is stable

### Deliverables
- OpenRouter-compatible headers (`HTTP-Referer`, `X-Title`)
- LiteLLM virtual model names supported as aliases
- `provider/model` syntax: `openai/gpt-4.1-nano`, `anthropic/claude-haiku-4.5`
- Import from OpenRouter: paste OpenRouter key, we pull routing history and suggest rules
- Side-by-side comparison: SmartRouter vs OpenRouter cost for same traffic

---

## Phase 7 — Enterprise
**Goal:** Multi-team, compliance, audit, SLAs.
**Timeline:** 6+ months

### Deliverables
- Multi-org auth (Clerk)
- Team roles: admin, developer, viewer, billing
- Audit log: every routing decision, rule change, key creation
- SOC 2 Type II controls
- Data residency options (EU/US)
- SLA: 99.9% uptime, < 50ms routing overhead
- Enterprise billing: volume discounts, invoicing, usage alerts
- On-prem / VPC deployment option

---

## Build Order Summary

```
Now:        Phase 3.5 — Repo-linked analysis (dashboard enhancement)
Next:       Phase 1   — Proxy + logging (router MVP)
Then:       Phase 2   — Task classification + smart routing
Parallel:   Phase 4   — Live pricing (can build alongside Phase 2)
After:      Phase 3   — Code attribution (needs Phase 1+2 data)
Later:      Phase 5   — Streaming + advanced routing
Then:       Phase 6   — OpenRouter compat
Enterprise: Phase 7
```

---

## Technology Stack Per Phase

| Layer | Phase 1-2 | Phase 3-5 | Phase 6-7 |
|-------|-----------|-----------|-----------|
| Router runtime | Next.js API routes | Cloudflare Workers | CF Workers + Durable Objects |
| Database | Neon Postgres | Neon Postgres | Neon + read replicas |
| Cache | Vercel KV | Upstash Redis | Upstash Redis cluster |
| Analytics | Neon aggregates | ClickHouse or CF Analytics Engine | ClickHouse |
| Auth | Vercel KV tokens | Clerk | Clerk Enterprise |
| Pricing data | Manual seed | LiteLLM OSS + cron | + provider webhooks |
| Deployment | Vercel | Vercel + CF Workers | CF + custom edge |
