# Sprint Plan — 2026-04-28

## Completed This Session

- [x] Fixed `detectHourlyVelocity` historical data guard (`lib/alerts/detector.ts:612`)
- [x] Written `lib/router/__tests__/virtualKeys.test.ts` (8 new tests)
- [x] Written 16 new tests in `lib/alerts/__tests__/detector.test.ts` (detectKeyVelocity, detectClaudeCodeOnAppKey, detectKeyRotationSpike)
- [x] Tests: 282 → 306, 0 failing
- [x] TypeScript: 0 errors maintained

---

## Sprint A: Security Loose Ends (~14 SP)

These items address the 2026-04-25 breach and SmartRouter hardening.

| ID | SP | Title | Notes |
|----|----|-------|-------|
| SA-01 | 2 | Wire `OPENAI_ADMIN_KEY` in Doppler (shows CHANGEME) | Blocking OpenAI cost tracking |
| SA-02 | 2 | Verify UpApply calls appear in `request_logs` after Render redeploy | Confirm SmartRouter wiring end-to-end |
| SA-03 | 1 | secondchance.dev — rotate to new Anthropic key | Old key potentially compromised |
| SA-04 | 3 | Audit CLARA/saskia/MyCloudExpert/cindyzody keys | Determine attacker's exact access window and usage |
| SA-05 | 2 | Clean stale Doppler→Render integrations | StoryMagicOrchestrator, StoryMagicWeb no longer active |
| SA-06 | 2 | Verify `/v1/messages` streaming SSE end-to-end with real UpApply request | Confirm SSE passthrough with actual streaming call |
| SA-07 | 2 | Onboard second client to virtual key system | Document the pattern; create `SMARTROUTER_KEY_*` vars for next client |

---

## Sprint B: Carryover from 2026-04-16 + New Items (~28 SP)

| ID | SP | Title | Source |
|----|----|-------|--------|
| CR-01 | 3 | Excluded key IDs settings page — UI in `/settings/keys` | 2026-04-16 Sprint 1 |
| CR-02 | 3 | SmartRouter streaming token accuracy in `/v1/chat/completions` | 2026-04-16 Sprint 1 |
| CR-03 | 3 | Fallback chain integration test | 2026-04-16 Sprint 1 |
| CR-04 | 2 | A/B experiment task type filter in create form | 2026-04-16 Sprint 1 |
| CR-05 | 3 | Webhook management UI — settings page | 2026-04-16 Sprint 2 |
| CR-06 | 4 | Dashboard annotation markers — click-to-annotate | 2026-04-16 Sprint 2 |
| CR-07 | 3 | Alert push + email tests (mock Expo + Resend) | 2026-04-16 Sprint 2 |
| CR-08 | 3 | `lib/router/fallback.ts` unit tests | 2026-04-16 Sprint 2 |
| CR-09 | 3 | `app/v1/messages/route.ts` unit tests (fetch mock) | New — identified this session |
| CR-10 | 2 | `lib/security/renderMonitor.ts` unit tests | New — identified this session |
| CR-11 | 2 | DB Migrations 0001–0004 applied to Neon | Blocking several Sprint B features |

---

## DB Migrations Pending

| Migration | Contents | Blocked By |
|-----------|----------|-----------|
| 0001_add_routing_config.sql | Routing config table | Nothing |
| 0002_add_pricing_and_webhooks.sql | Pricing + webhook tables | Nothing |
| 0003_add_callsite.sql | Callsite tracking | Nothing |
| 0004_phase5_advanced_routing.sql | Phase 5 advanced routing | Depends on 0001-0003 |
