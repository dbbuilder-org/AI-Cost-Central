# Tech Debt Remediation — 2026-04-28

## Summary

- console.log removed: 0 (none found in production paths)
- TODOs resolved: 0 implemented, 0 → issues
- `any` casts replaced: 0 (none found)
- Empty catches hardened: 0 (none found)
- Deferred: 1 item

---

## Fixed

| File:Line | Pattern | Resolution |
|-----------|---------|------------|
| `lib/alerts/detector.ts:612` | Logic gap — `detectHourlyVelocity` projected historical fixture data as if running at midnight UTC | Added `realToday` guard: exits early when dataset "today" ≠ real UTC date. Fixed 2 false `cost_spike` alerts in tests. |

---

## Deferred

| File:Line | Pattern | Reason | Sprint |
|-----------|---------|--------|--------|
| `lib/alerts/config.ts:44` | TODO: load per-project overrides from `alert_configs` DB table | Requires new DB migration + service layer — SP 5; needs design for merge semantics | Sprint B (CR-08 adjacent) |

---

## No console.log Found

Scanned `lib/`, `app/`, `components/` — no bare `console.log/warn/error` in production paths. All logging goes through structured Next.js server logging.

## No `any` Casts Found

New files (`lib/router/virtualKeys.ts`, `app/v1/messages/route.ts`, `lib/security/renderMonitor.ts`, `lib/alerts/detector.ts` additions) all fully typed.
