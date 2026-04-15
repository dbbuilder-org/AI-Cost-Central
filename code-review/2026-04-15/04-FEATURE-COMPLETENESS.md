# Feature Completeness — 2026-04-15

## Completed This Session (prior context + this session)

| Feature | What Was Missing | What Was Added |
|---------|-----------------|----------------|
| Env-var → DB key migration | Admin keys (OpenAI, Anthropic, Google, GitHub) were read from Vercel env vars | `resolveProviderKey` now DB-only; `ENV_FALLBACKS` removed |
| Multi-tenant alert cron | `fetchAllRows.ts` called Clerk-protected routes with no session → all alerts broken | Rewrote to query DB for orgs, use `x-cron-secret` + `x-org-id` bypass |
| Internal cron auth bypass | Usage routes had no server-to-server auth path | Added `resolveOrgId()` to openai, anthropic, google usage routes |
| Landing page | None — marketing site was placeholder | Full dark-theme Hero, HowItWorks, FeatureGrid, Testimonials, Nav, Footer, ProviderLogos |
| SmartRouter `classifyRequest` tests | 0 tests existed | 19 tests covering all task types, token estimation, tools, multi-part content |
| SmartRouter `route()` engine tests | 0 tests existed | 15 tests covering quality tiers, provider filtering, task overrides, savings calc, output structure |

## Still Incomplete

| Feature | Gap | Priority |
|---------|-----|---------|
| SmartRouter request log persistence | DB writes stubbed (see #1) | Sprint 1 |
| SmartRouter savings dashboard card | No frontend for logged savings | Sprint 1 (after #1) |
| OpenAI org key filtering UI | No way to exclude specific API key IDs from the dashboard without env var | Sprint 2 |

## Design Needed

| Feature | Why Deferred |
|---------|-------------|
| `request_logs` DB schema | Needs decision on retention policy and whether to shard by org |
| Streaming response token counting | OpenAI SSE streams don't report final token counts until the last chunk | Requires stream accumulation or estimation |
