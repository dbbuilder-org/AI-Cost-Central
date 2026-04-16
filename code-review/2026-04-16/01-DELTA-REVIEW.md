# Delta Review — 2026-04-16

## vs. Prior Review (2026-04-15)

All Sprint 1 actions from the 2026-04-15 review are now resolved:

| Prior Item | Status |
|------------|--------|
| Implement `request_logs` table and migration | ✅ RESOLVED (phases 5–6) |
| SmartRouter: insert row after each proxied completion | ✅ RESOLVED |
| Dashboard: SmartRouter savings summary card | ✅ RESOLVED (blended via `/api/smartrouter/usage`) |
| SmartRouter: accumulate streaming chunks for accurate token counts | ↩️ CARRYOVER |
| Integration tests for SmartRouter proxy route | ↩️ CARRYOVER |
| Tests for alert push + email (mock Expo + Resend) | ↩️ CARRYOVER |
| UI for excluding specific OpenAI API key IDs from dashboard | ↩️ CARRYOVER → Sprint 1 |

## New Since 2026-04-15

### Phases 5–17 (all merged to main):
- Phase 5: Advanced routing (fallback chains, prompt caching, latency-aware routing, A/B experiments)
- Phase 6: Provider expansion (model normalization, Cohere/Bedrock/Groq, OpenRouter comparison)
- Slack Block Kit alert delivery
- Spend forecasting with mini bar chart
- Round-robin key pool (`lib/router/keyPool.ts`)
- Notifications settings page + API
- SmartRouter usage blended into dashboard
- Key health check cron (6h) + manual test endpoint
- gitignore bug fix (recovered 3 routes)
- Project routing UI (`/projects/[projectId]`)

### This Session:
- 7 TypeScript errors fixed → 0
- A/B Experiments UI: create form + pause/resume/conclude/delete per experiment row
