# Sprint Plan — 2026-04-15

## Completed This Session

- [x] Fixed critical cron bug: `fetchAllRows.ts` now uses internal auth bypass
- [x] Removed `ENV_FALLBACKS` — all keys come from DB only
- [x] Added `resolveOrgId()` to openai, anthropic, google usage routes
- [x] Built full dark-theme marketing landing page
- [x] Fixed stale date test in `lib/briefs/__tests__/data.test.ts`
- [x] Wrote 19 classifier tests (100% task-type coverage)
- [x] Wrote 15 engine tests (quality tiers, provider filtering, savings calc)
- [x] Converted SmartRouter TODO → GitHub issue #1
- [x] TypeScript: 0 errors baseline, 0 errors after

---

## Sprint 1 (next 1–2 weeks)

### feat(smartrouter): DB request log persistence — #1 (SP 5)
Implement `request_logs` table + schema migration. Insert on every proxied completion (fire-and-forget). Wire actual token counts from provider response.

### feat(dashboard): SmartRouter savings card (SP 3)
After #1 lands, add a summary card showing: requests routed, avg savings %, total saved this month. Read from `request_logs`.

### fix(smartrouter): streaming token count (SP 3)
Accumulate chunks for streamed responses; extract `usage` from the final `[DONE]` chunk if available, else estimate from chars.

---

## Sprint 2 (future)

### test: SmartRouter proxy route integration tests (SP 5)
Mock `fetch` to upstream providers; assert correct model substitution and header forwarding.

### test: Alert push + email (SP 3)
Mock Expo SDK and Resend SDK; test threshold detection and send paths.

### feat: OpenAI key exclusion UI (SP 3)
UI in Settings for selecting which API key IDs to exclude from the dashboard (currently env-var-only).

### perf: Multi-tenant cron parallelism cap (SP 2)
`fetchAllRows` runs per-org requests in `Promise.all` — fine for < 20 orgs, but should be rate-limited for large deployments.
