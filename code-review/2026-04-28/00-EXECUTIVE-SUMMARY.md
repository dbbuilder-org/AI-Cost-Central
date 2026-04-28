# Code Review V3 — Executive Summary — 2026-04-28

## Rating: B+ → A-

**Session: Post-breach hardening + SmartRouter pilot + test remediation**

Since the last review (2026-04-16), 13 commits landed: 6 new anomaly detectors, Render service monitor, persistent alert DB cache, Anthropic-native SmartRouter proxy, virtual key isolation system, and the UpApply pilot. This session fixed 2 failing tests caused by the new `detectHourlyVelocity` detector, added 24 new tests covering the 3 new security detectors and the virtualKeys registry, and maintained 0 TypeScript errors throughout.

## Remediation Summary

| Dimension | Before | After |
|-----------|--------|-------|
| TypeScript errors | 0 | 0 |
| Failing tests | 2 | 0 |
| Tests (total) | 282 | 306 |
| New test suites | 0 | 2 (virtualKeys, 3 new detectors) |
| Tech debt items fixed | 1 | 1 (`detectHourlyVelocity` historical data guard) |
| Features completed | — | — (SmartRouter proxy shipped in prior commits) |

## Key Fixes

- **`detectHourlyVelocity` guard** (`lib/alerts/detector.ts:612`) — Added early-exit when the dataset's "today" doesn't match the real UTC date. Without this, historical fixture data (2026-04-13) was projected as if running at midnight UTC, generating false `cost_spike` alerts in 2 detector tests.
- **New detector tests** — `detectKeyVelocity`, `detectClaudeCodeOnAppKey`, `detectKeyRotationSpike` each have 5–6 test cases: happy path, below-threshold, missing data, escalation conditions, edge cases.
- **`virtualKeys` test suite** — 8 tests covering registry lookup, missing anthropic key, NaN budget, multi-key registration, env var slug casing.

## PRs This Session

- `fix/detector-tests-2026-04-28` — detector test fix + 24 new tests
