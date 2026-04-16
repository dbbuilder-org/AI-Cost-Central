# Code Review V3 — Executive Summary — 2026-04-16

## Rating: B → B+

**Session: Phase 5–17 consolidation + V3 remediation**

All 17 roadmap phases are merged to main. This session fixed all TypeScript errors, resolved a critical `requireRole` call-signature mismatch in the notifications route, eliminated a type-safety gap in the SmartRouter fallback chain, and completed the last noted feature gap (A/B experiment create/manage UI).

## Remediation Summary

| Dimension | Before | After |
|-----------|--------|-------|
| TypeScript errors | 7 | 0 |
| Tech debt items fixed | 0 | 0 (none SP ≤ 2 found) |
| Tests added | 277 | 277 (no new suites needed) |
| Features completed | 1 | 1 (A/B experiment UI) |

## Key Fixes

- **`requireRole` signature** (`notifications/route.ts`) — was called with wrong arity `requireRole(["owner","admin"])` instead of `requireRole(orgId, userId, "admin")`. Would have thrown at runtime for any PUT call.
- **Tuple cast** (`cron/alerts/route.ts`) — Promise.all 4-tuple was cast as 3-tuple; TS now correct.
- **`providerKey: null`** (`completions/route.ts`) — `pickKey()` can return null (no DB keys, no env var); now falls back to `""` instead of letting `null` propagate into `FallbackAttempt`.
- **Budget test `db.where` types** — mock accessed `.where` directly on db; added `(db as any)` casts (4 sites).
- **A/B Experiment UI** — `ABExperimentsCard` now includes create form + per-experiment pause/resume/conclude/delete actions. Previously the empty state told users to "use the API".

## PRs This Session

- `#18 fix/ts-errors-2026-04-16` — 7 TypeScript errors → 0
- `#19 feat/ab-experiments-ui` — create + manage experiments from dashboard
