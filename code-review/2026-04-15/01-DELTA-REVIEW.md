# Delta Review — 2026-04-15

## Prior Review
No prior code-review directory found — this is the first formal review.

## Session Scope
This session covered two merged work areas:
1. **Env-var → DB migration + multi-tenant cron** (prior context)
2. **Landing page** (prior context)
3. **Code Review V3 remediation** (this session)

## Changes Since Last Commit (key areas)

### Critical Bug Fix: Alert Cron Was Broken
`lib/alerts/fetchAllRows.ts` was making unauthenticated HTTP calls to usage routes protected by Clerk auth. Since cron jobs have no user session, every call returned 401 and alerts never fired. **Fixed**: routes now accept `x-cron-secret` + `x-org-id` internal auth headers; `fetchAllRows` queries DB for orgs and uses these headers.

### Env Key Migration
`resolveProviderKey` now DB-only. Removed `ENV_FALLBACKS` that silently fell back to env vars. All org-specific keys (OpenAI, Anthropic, Google, GitHub) must be stored in the encrypted `api_keys` table via Settings → API Keys.

### SmartRouter Tests
`lib/router/classifier.ts` and `lib/router/engine.ts` had 0 tests. Added 34 tests covering all decision paths.

### Date Test Fix
`lib/briefs/__tests__/data.test.ts` used hardcoded dates that went stale as the calendar advanced. Fixed to use `new Date()`.

## Status of Open Items

| Item | Status |
|------|--------|
| SmartRouter Phase 2 DB persistence | OPEN → issue #1 |
| Streaming token count accuracy | OPEN → Sprint 2 |
| Alert/cron auth bypass | ✅ RESOLVED |
| Env-var → DB key migration | ✅ RESOLVED |
