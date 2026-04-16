# Feature Completeness — 2026-04-16

## Completed This Session

| Feature | What Was Missing | What Was Added | PR |
|---------|-----------------|----------------|-----|
| A/B Experiments UI | Create form, pause/resume/conclude/delete actions | `ABExperimentsCard` extended with inline create form + per-row actions | #19 |

## Still Incomplete

| Feature | Backend | Frontend | Gap | Priority |
|---------|---------|---------|-----|---------|
| Excluded key IDs UI | ✅ `GET/POST /api/org/excluded-keys` | ❌ No settings page | Settings page with multi-select of active provider keys | Sprint 1 |
| SmartRouter streaming token accuracy | ✅ Proxy route | ⚠️ Estimates from response | Accumulate SSE chunks for precise input/output token counts | Sprint 1 |
| Webhook management UI | ✅ `GET/POST /api/org/webhooks` | ❌ No settings page | Add Webhooks section to settings | Sprint 2 |
| Annotations UI | ✅ `GET/POST /api/org/annotations` | ❌ No UI component | Chart annotation markers on dashboard | Sprint 2 |
| A/B experiment task type filter | ✅ Backend accepts `taskTypes[]` | ❌ Not in create form | Add multi-select to create form | Sprint 2 |

## Design Needed (not implemented)

| Feature | Missing Side | Why Deferred |
|---------|-------------|-------------|
| Integration tests for SmartRouter proxy | Tests | SmartRouter route makes live fetch calls; needs mock for fetch in vitest — SP > 5 |
| PII scrubbing in request logs | Backend config + middleware | Configurable regex approach needs design doc; Phase 7 precursor |
