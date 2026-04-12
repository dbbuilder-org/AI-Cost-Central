# AICostCentral — Architecture

## Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 (App Router) | Vercel-native, RSC for server fetches, API routes for proxy |
| Language | TypeScript | Type safety for API response shapes |
| UI | shadcn/ui + Tailwind CSS | Fast, accessible component library |
| Charts | Recharts | React-native, good TS support, composable |
| Excel | SheetJS (`xlsx`) | Client-side, no server needed |
| State | Zustand | Lightweight, works with RSC boundary |
| Data cache | Vercel KV (Upstash Redis) | TTL-based cache for API responses |
| Cron | Vercel Cron Jobs | Daily refresh of usage data |
| AI Analysis | Anthropic API (claude-haiku-4-5) | Cost-efficient for structured JSON recommendations |
| Deploy | Vercel | Zero-config, KV + Cron built-in |

---

## Directory Layout

```
/
├── app/
│   ├── layout.tsx                  # Root layout, ThemeProvider
│   ├── page.tsx                    # Redirect → /dashboard
│   ├── dashboard/
│   │   └── page.tsx                # Main dashboard
│   ├── settings/
│   │   └── page.tsx                # API key management
│   └── api/
│       ├── openai/
│       │   ├── usage/route.ts      # Proxy: fetch OpenAI usage (protects key)
│       │   └── keys/route.ts       # Proxy: fetch OpenAI API key list
│       ├── analyze/route.ts        # Call Claude Haiku with spend data
│       └── cron/refresh/route.ts   # Vercel Cron handler (daily refresh)
├── components/
│   ├── charts/
│   │   ├── SpendOverTime.tsx        # Stacked area chart
│   │   ├── CostByModel.tsx         # Horizontal bar chart
│   │   └── CostByKey.tsx           # Horizontal bar chart
│   ├── dashboard/
│   │   ├── OverviewCards.tsx
│   │   ├── ModelEfficiencyTable.tsx
│   │   └── RecommendationCards.tsx
│   ├── settings/
│   │   └── ApiKeyForm.tsx
│   └── ui/                         # shadcn components
├── lib/
│   ├── openai-admin.ts             # OpenAI Admin API client + type defs
│   ├── anthropic.ts                # Anthropic client + recommendation prompt
│   ├── cache.ts                    # Vercel KV read/write helpers
│   ├── transform.ts                # Raw API → unified UsageRow shape
│   └── excel.ts                    # SheetJS workbook builder
├── store/
│   └── useDashboard.ts             # Zustand store (filters, date range, data)
├── types/
│   └── index.ts                    # UsageRow, Recommendation, Provider enums
├── vercel.json                     # Cron schedule definition
└── .env.local                      # Keys (never committed)
```

---

## Data Flow

```
Browser
  │
  ├─► /settings  (user enters OpenAI Admin Key)
  │       └─► stored in localStorage (client-side)
  │
  └─► /dashboard
          │
          ├─► GET /api/openai/usage?days=28
          │       ├─ reads key from Authorization header (set by client)
          │       ├─ calls OpenAI /v1/organization/usage/completions (paginated)
          │       ├─ calls OpenAI /v1/organization/costs (paginated)
          │       ├─ merges → UsageRow[]
          │       └─ writes to Vercel KV (TTL 1h)
          │
          ├─► GET /api/openai/keys
          │       └─ returns API key list (names + IDs only, not secrets)
          │
          └─► POST /api/analyze  (on user click)
                  ├─ receives aggregated spend summary (not raw keys)
                  ├─ calls Anthropic claude-haiku-4-5
                  └─ returns Recommendation[]
```

---

## OpenAI Admin API Endpoints Used

| Endpoint | Purpose | Pagination |
|----------|---------|------------|
| `GET /v1/organization/usage/completions` | Token usage by model, day | `?start_time=&end_time=&limit=` cursor-based |
| `GET /v1/organization/usage/embeddings` | Embedding usage by model, day | same |
| `GET /v1/organization/costs` | Dollar costs by bucket | `?start_time=&end_time=` |
| `GET /v1/organization/api_keys` | Key names and IDs | `?limit=100` |

All require `Authorization: Bearer sk-admin-...` header.

---

## Cron Strategy (Keeping Data Fresh)

```
vercel.json:
{
  "crons": [{ "path": "/api/cron/refresh", "schedule": "0 2 * * *" }]
}
```

The cron route:
1. Reads stored API keys from Vercel KV (keys stored server-side by settings save)
2. Fetches last 28 days of usage from each provider
3. Writes `usage:{provider}:{keyId}:{YYYY-MM-DD}` into KV with 30-day TTL
4. Dashboard reads from KV first; falls back to live fetch if cache miss

---

## Claude Haiku Analysis Prompt Design

Input to Haiku (structured JSON, ~2K tokens):
```json
{
  "window_days": 28,
  "total_cost_usd": 847.32,
  "by_model": [
    { "model": "gpt-4o", "cost": 612.10, "requests": 45000, "input_tokens": 89M, "output_tokens": 12M },
    { "model": "gpt-4o-mini", "cost": 98.44, "requests": 210000, ... },
    ...
  ],
  "by_api_key": [...],
  "weekly_trend": [...]
}
```

System prompt instructs Haiku to return JSON array of `Recommendation` objects. Temperature 0.2 for consistency. Max 1000 output tokens.

---

## Security Considerations

- OpenAI Admin key is sent from client to `/api/openai/*` routes via `X-OpenAI-Admin-Key` request header over HTTPS — never in query string, never logged.
- Server-side proxy means the key is never stored in Vercel logs as a URL param.
- For cron use, a separate "server key" can be stored in Vercel environment variables (set by user in Vercel dashboard), distinct from the browser-session flow.
- Anthropic key for Haiku analysis stored in `ANTHROPIC_API_KEY` env var only.
- No PII is sent to Haiku — only aggregated cost/token numbers.
