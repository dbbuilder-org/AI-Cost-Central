# Session Context - 2026-04-12

**Project:** AICostCentral
**Path:** /Users/admin/dev2/AICostCentral

## Summary

Extended AICostCentral from an OpenAI-only spend tracker into a full multi-provider AI cost dashboard covering OpenAI, Anthropic, and Google Gemini. The session also completed SmartRouter Phase 1 (missing files that blocked builds) and implemented a Claude Code cost contamination filter so subscription-billed Claude Code sessions don't inflate the API cost totals.

All three providers now fetch in parallel, merge into a unified row set, and flow through the existing `buildSummary()` pipeline. Provider badges (OAI/ANT/GGL) appear on model names in the Efficiency Table. The dashboard title updated to "AI Spend Dashboard — OpenAI · Anthropic · Google". Live at https://ai-cost-central.vercel.app.

## Files Modified

- `/Users/admin/dev2/AICostCentral/types/router.ts` — Created (was missing; caused build failures). All SmartRouter types.
- `/Users/admin/dev2/AICostCentral/app/v1/models/route.ts` — Created. Virtual model alias catalog in OpenAI list format.
- `/Users/admin/dev2/AICostCentral/app/v1/embeddings/route.ts` — Created. Passthrough proxy to OpenAI embeddings.
- `/Users/admin/dev2/AICostCentral/lib/router/translators/anthropic.ts` — Created. OpenAI↔Anthropic format translation + streaming TransformStream.
- `/Users/admin/dev2/AICostCentral/app/api/anthropic/usage/route.ts` — Created + iterated. Fetches 28d token usage from `usage_report/messages`, calculates cost from local pricing catalog (dropped cost_report — double-counts). Fetches real key names from `/v1/organizations/api_keys`. Excludes the Claude Code onboarding key (`apikey_01KoucGYDmnUxroy7D8wRDH8`) and any key ID in `ANTHROPIC_EXCLUDED_KEY_IDS` env var. Fingerprint filter: Opus rows with >1M cache_read tokens but <500 uncached_input tokens → skip (Claude Code signature).
- `/Users/admin/dev2/AICostCentral/app/api/google/usage/route.ts` — Created. Google Cloud Monitoring API via service account JWT auth → OAuth2 token. Only metric available for AI Studio: `generativelanguage.googleapis.com/generate_content_usage_output_token_count`. Input tokens estimated: text models = output×1, image/veo = output×0.02.
- `/Users/admin/dev2/AICostCentral/lib/transform.ts` — Added `transformAnthropic()` and `transformGoogle()`. Updated `buildSummary()` to track `provider` in ModelSummary.
- `/Users/admin/dev2/AICostCentral/types/index.ts` — Widened `UsageRow.provider` to `"openai" | "anthropic" | "google"`. Added optional `provider` field to `ModelSummary`.
- `/Users/admin/dev2/AICostCentral/store/useDashboard.ts` — `fetchData()` now fetches all 3 providers via `Promise.allSettled`, merges rows, builds summary. Partial failures show warning banner without blocking other providers.
- `/Users/admin/dev2/AICostCentral/app/dashboard/page.tsx` — Title updated to "AI Spend Dashboard — OpenAI · Anthropic · Google".
- `/Users/admin/dev2/AICostCentral/components/dashboard/ModelEfficiencyTable.tsx` — Added colored provider badges: `OAI` (indigo), `ANT` (orange), `GGL` (green) next to model names.
- `/Users/admin/dev2/AICostCentral/.env.local` — Added `ANTHROPIC_ADMIN_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON`.

## Current State

- Dashboard live with all 3 providers: OpenAI + Anthropic + Google Gemini
- Total spend shown as ~$474 (28d) — this is the real combined API cost
- Claude Code contamination filtered: hardcoded onboarding key + cache-read fingerprint heuristic
- Anthropic key names resolved from admin API (e.g. "Anthropic · ArcTrade", "Anthropic · CLARA")
- Gemini input tokens estimated (Google AI Studio doesn't expose them via Monitoring)
- SmartRouter Phase 1 endpoints live: /v1/chat/completions, /v1/models, /v1/embeddings
- All builds clean, deployed to Vercel production

## Next Steps

- [ ] Verify the 03-26 $118 Opus spike is gone after cache-read fingerprint filter deploy
- [ ] If other Claude Code bleeds through, add key IDs to `ANTHROPIC_EXCLUDED_KEY_IDS` Vercel env var
- [ ] SmartRouter Phase 2: activate Anthropic routing path (translators are ready)
- [ ] Consider adding Anthropic `service_tier` field as a filter option
- [ ] Add "By Provider" summary card / breakdown to OverviewCards
- [ ] Wire Gemini request counts more accurately (currently from serviceruntime metric which lacks model labels)

## Open Questions / Blockers

- Google AI Studio input token estimation is a rough heuristic (1:1 for text, 2% for image). No official metric exists for input tokens on gen-lang-client projects.
- The 03-26 Opus spike: confirmed as CLARA key + Claude Code cache-read fingerprint. Filter should eliminate it — needs browser refresh to confirm.
- `ANTHROPIC_EXCLUDED_KEY_IDS` env var not yet set in Vercel (onboarding key is hardcoded, any additional keys need manual Vercel dashboard entry).
