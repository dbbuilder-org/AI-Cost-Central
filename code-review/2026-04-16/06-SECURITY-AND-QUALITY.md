# Security & Quality — 2026-04-16

## Changed/New Code Review

### `app/api/org/notifications/route.ts` (fixed)
- **FIXED:** `requireRole` was called with wrong signature — arity mismatch meant role check was not executing correctly. Admin writes were not properly gated.
- The fix: `requireRole(orgId, userId, "admin")` — correct three-argument call.

### `app/v1/chat/completions/route.ts` (fixed)
- `primaryKey ?? ""` — if both DB keys and env var are absent, the key becomes `""`. The downstream provider will return 401, which is the correct failure mode (not a crash). No silent data exposure.

### `components/dashboard/ABExperimentsCard.tsx` (new UI)
- All API calls use relative paths (`/api/smartrouter/experiments`) — no SSRF risk.
- Delete action requires explicit `confirm()` dialog before proceeding.
- No user-supplied data rendered as HTML — all values are text node inserts via React.
- `experimentId` values come from server-fetched list, not user input, so no injection risk in PATCH/DELETE paths.

### `lib/router/__tests__/budget.test.ts` (fixed)
- `(db as any)` casts are test-only (excluded from production builds). No security impact.

## No New Findings

Scan of all new modules from phases 5–17 confirmed:
- No SQL injection risk (all queries use Drizzle parameterized calls)
- No XSS risk (React JSX escapes all outputs)
- No hardcoded secrets (keys resolved from env/DB at runtime)
- No path traversal (no user-controlled file paths)
- `SLACK_ALERT_WEBHOOK_URL` only used server-side in `lib/alerts/slack.ts`, never exposed to client
