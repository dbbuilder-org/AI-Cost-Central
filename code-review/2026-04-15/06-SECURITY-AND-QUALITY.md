# Security and Quality — 2026-04-15

## Security

### Changed/New Code Review

**`lib/alerts/fetchAllRows.ts` (rewritten)**
- BEFORE: Made unauthenticated HTTP calls to Clerk-protected routes from cron context — all calls returned 401.
- AFTER: Uses `CRON_SECRET` as a shared secret, validated server-side in each usage route. Only trusted server code knows this secret; it's never exposed to browsers.
- Risk: If `CRON_SECRET` is leaked, an attacker could impersonate the cron runner and fetch usage for any org. Mitigated by: secret rotation, Vercel env var (not checked in).

**`resolveProviderKey` (updated)**
- Removed `ENV_FALLBACKS` — no more "just use the env var if DB lookup fails." This prevents a configuration mistake from silently routing all traffic through a single shared key.
- Error message now directs to Settings → API Keys, not a generic "not configured" message.

**`app/api/*/usage/route.ts` — `resolveOrgId`**
- Internal bypass requires both `x-cron-secret` AND `x-org-id`. Neither alone is sufficient.
- Cron secret is compared with `===` (constant-time for strings of equal length via V8 — acceptable for a secret of this length; for future hardening, `crypto.timingSafeEqual` could be used).

**`app/v1/chat/completions/route.ts` — SmartRouter**
- Auth via `resolveVirtualKey(auth)` — only accepts Bearer tokens matching the org's virtual key.
- No user input is interpolated into SQL or shell commands.
- Proxied requests to upstream providers use the org's stored API key, not user-supplied credentials.

## Quality

- **0 TypeScript errors** (`tsc --noEmit` clean)
- **146/146 tests pass**
- **0 TODOs remaining** in production paths (1 converted to issue #1)
- `console.log` in SmartRouter is guarded behind `NODE_ENV === "development"` — does not fire in production
