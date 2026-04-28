# Security and Quality — 2026-04-28

## Changed/New Code Since 2026-04-16

### `app/v1/messages/route.ts` — SmartRouter Anthropic Proxy

**Auth model:** Virtual key validated against registry before any upstream call. Invalid keys return 401 JSON immediately — no upstream request made. Real `sk-ant-*` keys never exposed to calling apps.

**Header hygiene:** `STRIP_HEADERS` set removes `host`, `x-forwarded-*`, `authorization`, `content-length`, `connection`, `transfer-encoding`, `content-encoding`. The `content-encoding` strip is critical: Anthropic returns gzip, `upstream.text()` auto-decompresses, so forwarding the header caused double-decompression → empty body in clients.

**Streaming:** `TransformStream` taps SSE events only to extract token counts; all bytes forwarded verbatim. No response body mutation.

**Budget enforcement:** Checks `dailyBudgetUsd` before forwarding. Currently compares against daily spend from `request_logs` — correct approach; no bypass possible via header injection since budget is resolved from the virtual key registry (not client-supplied).

**Risk:** `maxDuration = 60` — long-running Anthropic requests (extended thinking) could hit the 60s Vercel function limit. Consider raising to 300s (Vercel Pro default) for streaming endpoints.

### `lib/router/virtualKeys.ts` — Virtual Key Registry

**Isolation:** Registry built at cold start from env vars. No runtime mutation. `Map.get()` is O(1) and cannot be poisoned by request input.

**Key format:** `sk-sr-{slug}-{suffix}` — worthless outside SmartRouter. Real keys never returned to callers; only `VirtualKeyContext` (projectId, orgId, provider, budget) is exposed. `realApiKey` is used internally only.

**Missing:** No rate limiting on `/v1/messages` beyond budget. A valid virtual key holder can flood the endpoint. Consider adding per-key request rate limiting (Sprint B).

### `lib/alerts/detector.ts` — 6 New Detectors

**`detectHourlyVelocity` guard:** Historical fixture data no longer triggers false alerts. The `realToday !== todayDate` guard is correct — exits before any projection arithmetic when data is from a different day.

**`detectKeyRotationSpike`:** Counts keys created within 24h. An attacker creating keys rapidly will trigger this — good. Edge case: legitimate key rotation during incident response could also fire. Threshold should be configurable (see `lib/alerts/config.ts:44` TODO).

**`detectClaudeCodeOnAppKey`:** Detects Claude Code CLI usage on production app keys (ratio of `claude-code` user-agent tokens). Effective attacker fingerprint since the breach attacker used Claude Code CLI on stolen keys.

### `lib/security/renderMonitor.ts` — Render Service Monitor

Polls Render API for suspended/failed services. Attacker suspended services to cover tracks. Monitor alerts on unexpected service state changes. No secrets in code — Render API key via env var.

### `proxy.ts` — Middleware Exemption

`/v1/(.*)` added to public routes. This is correct: SmartRouter handles its own auth (virtual key validation). Clerk should not intercept these routes. If Clerk is ever removed, this exemption is benign — the handler still validates the virtual key.

---

## Outstanding Security Items

| Item | Priority | Notes |
|------|----------|-------|
| SA-01: Wire `OPENAI_ADMIN_KEY` (shows CHANGEME in Doppler) | P0 | Blocking cost tracking for OpenAI-hosted apps |
| SA-02: Verify UpApply calls appear in `request_logs` after Render redeploy | P1 | Confirm SmartRouter wiring end-to-end |
| SA-03: secondchance.dev new Anthropic key | P1 | Old key potentially compromised |
| SA-04: Audit CLARA/saskia/MyCloudExpert/cindyzody keys | P1 | All hit by attacker Apr 25 |
| SA-05: Clean stale Doppler→Render integrations | P2 | StoryMagicOrchestrator, StoryMagicWeb |
| Rate limiting on `/v1/messages` | P2 | No per-key request cap today |
