# Delta Review — 2026-04-28

**Prior review:** 2026-04-16 | **This review:** 2026-04-28 | **Commits in window:** 13

---

## Prior Open Items

| Item | Status | Notes |
|------|--------|-------|
| Excluded key IDs settings page | CARRYOVER | → CR-01 in SPRINT_PLAN |
| SmartRouter streaming token accuracy (SSE chunk accumulation) | PARTIAL | SSE tap implemented in `/v1/messages`; completions route still needs fix → CR-02 |
| Fallback chain integration test | CARRYOVER | → CR-03 |
| A/B experiment task type filter | CARRYOVER | → CR-04 |
| Webhook management UI | CARRYOVER | → CR-05 |
| Dashboard annotation markers | CARRYOVER | → CR-06 |
| Alert push + email tests | CARRYOVER | → CR-07 |
| `lib/router/fallback.ts` unit tests | CARRYOVER | → CR-08 |
| DB Migrations pending (0001–0004) | CARRYOVER | Not applied to Neon; tracked separately |

---

## New Work Since 2026-04-16

| Commit | Area | Summary |
|--------|------|---------|
| `ba0e657` | Core | Idempotent digest + persistent alert cache |
| `6113df2` | AI features | Code-aware AI anomaly detection with GitHub repo scanning |
| `a264f06` | Infra | Swap Vercel Blob → Cloudflare R2 for key document storage |
| `3f26017` | UI | API key annotation UI: doc uploads + repo linking |
| `c2c185b` | Alerts | Soften `cost_drop` severity; skip zero-spend days |
| `42887ca` | UI | A/B experiments UI: create, pause/resume/conclude/delete |
| `17bc51e` | Mobile | iOS push + SMS notifications for anomaly alerts (#20) |
| `e9a0e0a` | Google | Budget alerts + Cloud Function kill switch |
| `678c89e` | Security | 6 new anomaly detectors + Render service monitor |
| `ae83108` | SmartRouter | Anthropic-native `/v1/messages` transparent proxy |
| `df680eb` | Middleware | Exempt `/v1/*` from Clerk auth (SmartRouter handles auth) |
| `94aadad` | SmartRouter | Strip `content-encoding` from forwarded response headers |
| `9f5b977` | Docs | Consolidated roadmap 2026-04-28 |

---

## Security Event: Breach Response (2026-04-25)

An active attacker hit multiple client keys (CLARA, saskia, MyCloudExpert, cindyzody-testkey) via a compromised Render env var. Key response actions taken:

- Real `sk-ant-*` keys moved from Render env vars into Vercel (encrypted at rest)
- UpApply wired to use a virtual `sk-sr-upapply-*` key routed through SmartRouter
- 6 new anomaly detectors added to catch attacker patterns (key velocity, Claude Code on app key, key rotation spike)
- Render service monitor added to detect service suspensions (attacker suspended several services)

Remaining breach remediation tracked as SA-01–SA-07 in SPRINT_PLAN.

---

## v3 Remediation Summary

| Dimension | Before | After |
|-----------|--------|-------|
| TypeScript errors | 0 | 0 |
| Failing tests | 2 | 0 |
| Tests total | 282 | 306 |
| New test suites | 0 | 2 (`virtualKeys`, 3 new detectors) |
| Tech debt fixed | — | 1 (`detectHourlyVelocity` guard) |
| TODOs converted to issues | — | 0 (1 deferred SP>2) |
