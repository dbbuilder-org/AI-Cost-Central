# AICostCentral — Phase 1 TODO

Ordered execution plan for the OpenAI prototype.

## 1. Scaffold
- [ ] `npx create-next-app@latest . --typescript --tailwind --app --src-dir=no`
- [ ] `npx shadcn@latest init` (style: default, base color: slate)
- [ ] Install deps: `recharts zustand xlsx @anthropic-ai/sdk @vercel/kv`
- [ ] Create `types/index.ts` with `UsageRow`, `Recommendation`, `ProviderKey` types
- [ ] Create `.env.local` with `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`

## 2. Settings Page
- [ ] `app/settings/page.tsx` — form to enter OpenAI Admin key
- [ ] `components/settings/ApiKeyForm.tsx`
  - Input (type=password), Save, Test Connection buttons
  - On save: store in localStorage under `aicc:keys:openai`
  - On Test: call `/api/openai/keys` — show success badge or error

## 3. API Proxy Routes
- [ ] `app/api/openai/usage/route.ts`
  - Accept `X-OpenAI-Admin-Key` header
  - Paginate through `/v1/organization/usage/completions` (start=28d ago, end=today)
  - Paginate through `/v1/organization/usage/embeddings`
  - Fetch `/v1/organization/costs`
  - Merge into `UsageRow[]` via `lib/transform.ts`
  - Write to Vercel KV with 1h TTL
  - Return JSON
- [ ] `app/api/openai/keys/route.ts`
  - Fetch `/v1/organization/api_keys`
  - Return `{ id, name, created_at }[]`

## 4. Data Transform (`lib/transform.ts`)
- [ ] Map OpenAI usage endpoint responses → `UsageRow[]`
- [ ] Join cost data onto usage rows (match by day)
- [ ] Compute derived fields: `costPer1KInput`, `costPer1KOutput`

## 5. Zustand Store (`store/useDashboard.ts`)
- [ ] State: `rows: UsageRow[]`, `loading`, `error`, `dateRange`, `filterKey`, `filterModel`
- [ ] Actions: `fetchData()`, `setDateRange()`, `setFilter()`
- [ ] `fetchData()` calls `/api/openai/usage` with key from localStorage

## 6. Dashboard Page (`app/dashboard/page.tsx`)
- [ ] Load store on mount, show skeleton loaders while fetching
- [ ] Date range tabs (7d / 14d / 28d)
- [ ] Filter dropdowns (by API key, by model)
- [ ] Grid layout: cards top, charts middle, table bottom

## 7. Components

### Overview Cards (`components/dashboard/OverviewCards.tsx`)
- [ ] Total Spend (28d) — big number + WoW delta badge
- [ ] Top Model by Cost
- [ ] Top API Key by Cost
- [ ] Total Requests

### Charts
- [ ] `SpendOverTime.tsx` — `<AreaChart>` stacked by model, X=date, Y=USD
- [ ] `CostByModel.tsx` — `<BarChart horizontal>` sorted desc, tooltip shows tokens
- [ ] `CostByKey.tsx` — `<BarChart horizontal>`, click to expand model breakdown

### Model Efficiency Table (`components/dashboard/ModelEfficiencyTable.tsx`)
- [ ] Columns: Model | Requests | Input Tokens | Output Tokens | Total Cost | $/1K In | $/1K Out
- [ ] Sortable columns
- [ ] Color-code $/1K Out (green=cheap, red=expensive)

## 8. Excel Export (`lib/excel.ts`)
- [ ] Sheet 1 "Raw Data": all `UsageRow[]` columns, one row per day/model/key
- [ ] Sheet 2 "By Model": pivot — rows=model, cols=week1..week4, values=cost
- [ ] Sheet 3 "By API Key": same pivot by key
- [ ] Sheet 4 "Recommendations": table of recommendation cards
- [ ] "Export to Excel" button triggers client-side download (no server)

## 9. AI Recommendations
- [ ] `app/api/analyze/route.ts`
  - Build aggregated summary from `UsageRow[]` (no raw keys in payload)
  - Call `claude-haiku-4-5-20251001` with structured JSON prompt
  - Parse response → `Recommendation[]`
  - Return JSON
- [ ] `components/dashboard/RecommendationCards.tsx`
  - Card per recommendation, color-coded by impact (red/yellow/green)
  - Categories: cost_reduction, model_migration, reporting, anomaly
  - "Analyze Spend" button (disabled until data loaded)

## 10. Caching & Cron
- [ ] `lib/cache.ts` — Vercel KV get/set with TTL helpers
- [ ] Add KV read to usage route (return cached if < 1h old)
- [ ] `app/api/cron/refresh/route.ts`
  - Reads server-side `OPENAI_ADMIN_KEY` env var
  - Fetches 28d, writes to KV
  - Secured by `CRON_SECRET` env var check
- [ ] `vercel.json` — add cron schedule `"0 2 * * *"`

## 11. Polish & Deploy
- [ ] Dark/light mode toggle (shadcn ThemeProvider)
- [ ] Empty state when no key configured (CTA → Settings)
- [ ] Error boundary with retry button
- [ ] `vercel env add` for all secrets
- [ ] `vercel deploy`
- [ ] Smoke test: load dashboard, check 28d data, export Excel, run analysis
