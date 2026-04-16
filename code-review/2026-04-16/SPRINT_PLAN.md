# Sprint Plan — 2026-04-16

## Completed (this and prior sessions)

- [x] Phases 0–6 all merged to main (#1–#17)
- [x] TypeScript: 0 errors
- [x] A/B Experiment UI (create + manage from dashboard)
- [x] All Sprint 1 items from 2026-04-15 resolved

---

## Sprint 1 (next session)

| # | Item | SP | Notes |
|---|------|----|-------|
| 1 | Excluded key IDs settings page | 3 | `GET/POST /api/org/excluded-keys` exists; needs UI in `/settings/keys` |
| 2 | SmartRouter streaming token accuracy | 5 | Accumulate SSE chunks; update `request_logs.input_tokens` + `output_tokens` |
| 3 | Fallback chain integration test | 3 | Mock `fetch` in vitest; test primary 429 → fallback path |
| 4 | A/B experiment task type filter in create form | 2 | Multi-select for `taskTypes[]` field |

## Sprint 2

| # | Item | SP | Notes |
|---|------|----|-------|
| 5 | Webhook management UI | 4 | Settings page for `GET/POST /api/org/webhooks` |
| 6 | Dashboard annotation markers | 5 | Click on chart to add annotation; `GET/POST /api/org/annotations` |
| 7 | Alert push + email tests (mock Expo + Resend) | 3 | `lib/alerts/push.test.ts`, `lib/alerts/email.test.ts` (stubs exist) |
| 8 | `lib/router/fallback.ts` unit tests | 3 | Mock fetch; test retryable status codes |

## Backlog / Phase 7 (sales-gated)

- PII scrubbing in request logs (configurable regex)
- SmartRouter proxy integration test
- Enterprise SSO, SCIM provisioning
- Multi-region routing
