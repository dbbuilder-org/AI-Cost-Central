# Test Generation Report — 2026-04-28

## Coverage Delta

| Area | Before (tests) | After (tests) | New Tests Added |
|------|---------------|--------------|-----------------|
| detector.test.ts | 40 | 56 | +16 (3 new detectors) |
| virtualKeys.test.ts | 0 (new file) | 8 | +8 |
| **Total** | **282** | **306** | **+24** |

## Tests Written This Session

### `lib/router/__tests__/virtualKeys.test.ts` — NEW (8 tests)

| Test | Assertion |
|------|-----------|
| Unknown key → null | `resolveVirtualKeyForAnthropic("sk-sr-nonexistent")` returns null |
| Empty string key → null | `resolveVirtualKeyForAnthropic("")` returns null |
| Valid key with budget | Returns full context with correct projectId, orgId, realApiKey, provider, dailyBudgetUsd |
| Valid key, no budget env var | `dailyBudgetUsd` is null |
| Orphan key (no ANTHROPIC_KEY_*) | Skipped at build time → returns null |
| Slug case-insensitivity | `SMARTROUTER_KEY_MYSLUG` → `projectId = "myslug"` |
| NaN budget string | `dailyBudgetUsd` coerces to null |
| Multiple keys independent | `app1` and `app2` resolve independently with correct realApiKey each |

All 8 pass. Pattern: `vi.resetModules()` + `vi.stubEnv()` + `await import()` to test module-level registry.

### `lib/alerts/__tests__/detector.test.ts` — +16 tests

#### `detectKeyVelocity` (6 tests)

| Test | Assertion |
|------|-----------|
| Fires when same-day spike | Returns `key_velocity` alert above threshold |
| No fire when different-day | Different createdAt day → no alert |
| Below threshold | Count < minRequests → no alert |
| No createdAt field | Skips gracefully → no alert |
| Critical with Claude Code fingerprint | `useragent` contains `claude-code` → severity `critical` |
| Warning without Claude Code | No `claude-code` fingerprint → severity `warning` |

#### `detectClaudeCodeOnAppKey` (5 tests)

| Test | Assertion |
|------|-----------|
| Fires above threshold | ratio ≥ 0.5 + tokens ≥ 1000 → alert |
| Below min tokens | totalTokens < 1000 → no alert |
| Below ratio | ratio < 0.5 → no alert |
| Baseline showed pattern | Already in baseline → no alert (idempotent) |
| Non-Anthropic provider | Skips non-Anthropic keys |

#### `detectKeyRotationSpike` (5 tests)

| Test | Assertion |
|------|-----------|
| Fires at threshold | N new keys in last 24h ≥ threshold → alert |
| Below threshold | Count < threshold → no alert |
| Keys too old | createdAt > 24h ago → excluded |
| Per-provider separately | Anthropic + OpenAI each fire independently |
| Empty without createdAt | No createdAt field → no alert |

## Still Uncovered (deferred)

| Module | Reason | Sprint |
|--------|--------|--------|
| `lib/router/fallback.ts` | Complex multi-provider mock setup; SP 3 | Sprint B (CR-08) |
| `app/v1/messages/route.ts` | Needs `fetch` mock for Anthropic upstream; SP 3 | Sprint B |
| `lib/security/renderMonitor.ts` | Render API mock needed; SP 2 | Sprint A |
| Alert push/email (Expo + Resend) | External service mocks needed; SP 3 | Sprint B (CR-07) |
