# Feature Completeness — 2026-04-28

## Completed This Session

| Feature | What Was Missing | What Was Added |
|---------|-----------------|----------------|
| Anthropic-native SmartRouter proxy | `/v1/messages` transparent pass-through so UpApply's real key never touches Render | `app/v1/messages/route.ts` — streaming SSE + usage tapping + budget enforcement |
| Virtual key system | Registry for routing `sk-sr-*` keys to real provider keys | `lib/router/virtualKeys.ts` — env-var-driven registry, built at cold start |
| Clerk middleware exemption | `/v1/*` was intercepted by Clerk, returning HTML login redirect | Added `/v1/(.*)` to public routes in `proxy.ts` |
| `content-encoding` stripping | Proxy forwarded gzip header causing double-decompression → empty body | Added `"content-encoding"` to `STRIP_HEADERS` set |

## Completed in Prior Commits (Since 2026-04-16)

| Feature | Status |
|---------|--------|
| 6 new anomaly detectors (keyVelocity, claudeCodeOnAppKey, keyRotationSpike, hourlyVelocity, patternDeviation, serviceMonitor) | Complete — in `lib/alerts/detector.ts` |
| Render service monitor | Complete — `lib/security/renderMonitor.ts` |
| Persistent alert DB cache | Complete — `ba0e657` |
| GitHub repo-linked code analysis | Complete — `6113df2` |
| A/B Experiments UI | Complete — `42887ca` |
| iOS push + SMS notifications | Complete — `17bc51e` |
| Google Cloud budget alerts + kill switch | Complete — `e9a0e0a` |

## Still Incomplete

| Feature | Backend | Frontend | Gap | Priority |
|---------|---------|----------|-----|----------|
| Excluded key IDs settings page | `GET/POST /api/org/excluded-keys` exists | No UI in `/settings/keys` | Frontend only | P1 (CR-01) |
| SmartRouter streaming token accuracy | SSE tap in `/v1/messages` ✓; `/v1/chat/completions` still chunks all at once | — | Completions route fix | P1 (CR-02) |
| Webhook management UI | Routes exist | No settings page | Frontend only | P2 (CR-05) |
| Dashboard annotation markers | — | Planned | Full feature | P2 (CR-06) |

## Design Needed

| Feature | Why Deferred |
|---------|--------------|
| Per-project alert config overrides (DB-backed) | Requires `alert_configs` table migration + merge semantics design |
| UpApply streaming SSE end-to-end verification | Need real UpApply Render redeploy + prod call to confirm SSE passthrough |
