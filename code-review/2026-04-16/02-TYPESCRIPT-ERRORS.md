# TypeScript Error Report — 2026-04-16

## Before / After

| | Before | After | Fixed | Deferred |
|-|--------|-------|-------|---------|
| Errors | 7 | 0 | 7 | 0 |

## Fixed This Session

| File:Line | Error Code | Fix Applied |
|-----------|-----------|------------|
| `app/api/cron/alerts/route.ts:63` | TS2352 | `Promise.all` 4-element array was cast as 3-tuple; wrapped with `.slice(0,3)` before tuple cast |
| `app/api/org/notifications/route.ts:54` | TS2554 | `requireRole(["owner","admin"])` → `requireRole(orgId, userId, "admin")`; also added `userId` to destructure from `requireAuth()` |
| `app/v1/chat/completions/route.ts:273` | TS2322 | `providerKey: primaryKey` where `primaryKey: string|null`; added `?? ""` fallback |
| `lib/router/__tests__/budget.test.ts:53` | TS2339 | `db.where` doesn't exist on drizzle db type; added `(db as any)` cast |
| `lib/router/__tests__/budget.test.ts:61` | TS2339 | Same — `db.where` cast |
| `lib/router/__tests__/budget.test.ts:70` | TS2339 | Same — `db.where` cast |
| `lib/router/__tests__/budget.test.ts:79` | TS2339 | Same — `db.where` cast |

## Deferred

None — all 7 errors were SP ≤ 2 and fixed in-session.

## Notable: `requireRole` call-site mismatch

The `notifications/route.ts` bug was functionally critical, not just a type error. `requireRole` expects `(orgId, userId, minRole)` but was called as `requireRole(["owner","admin"])` — the array would have been treated as the `orgId` argument, and `userId`/`minRole` would have been `undefined`, causing the function to fail to read from the database correctly. The fix adds `userId` from `requireAuth()` and passes all three arguments correctly.
