# AICostCentral

AI API spend analytics dashboard — per API-key, per model, with AI-powered recommendations.

## What it does

- Pulls 28 days of usage and cost data from the **OpenAI Admin API**
- Visualizes spend by model and by API key with interactive charts
- Surfaces model efficiency ($/1K tokens) in a sortable table
- Exports everything to **Excel** (5 sheets: raw data, by model, by API key, weekly trend, recommendations)
- Generates **AI-powered recommendations** via Claude Haiku (cost reduction, model migration, anomaly detection)
- Refreshes data daily via Vercel Cron

## Tech Stack

Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · Recharts · SheetJS · Zustand · Anthropic SDK · Vercel KV

## Setup

### 1. Clone and install

```bash
git clone https://github.com/dbbuilder-org/AI-Cost-Central.git
cd AI-Cost-Central
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_ADMIN_KEY` | Yes (for cron) | OpenAI Admin API key (`sk-admin-...`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude Haiku analysis |
| `KV_REST_API_URL` | Optional | Vercel KV URL (from `vercel env pull`) |
| `KV_REST_API_TOKEN` | Optional | Vercel KV token |
| `CRON_SECRET` | Yes (prod) | Random secret to secure the cron endpoint |

> **Browser flow:** The OpenAI Admin key can also be entered directly in the Settings UI — stored in `localStorage` and sent via HTTPS header to the API proxy. Never logged or persisted server-side.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/dashboard`.

Go to **Settings** and enter your OpenAI Admin API key, then click **Test Connection**.

### 4. Deploy to Vercel

```bash
vercel deploy
```

Set environment variables in the Vercel dashboard. The cron job at `/api/cron/refresh` runs daily at 02:00 UTC.

## Project Structure

```
app/
  dashboard/          # Main analytics dashboard
  settings/           # API key management
  api/
    openai/usage/     # OpenAI Admin API proxy (usage + costs)
    openai/keys/      # OpenAI key list proxy
    analyze/          # Claude Haiku recommendations
    cron/refresh/     # Daily data refresh
components/
  charts/             # Recharts: SpendOverTime, CostByModel, CostByKey
  dashboard/          # OverviewCards, ModelEfficiencyTable, RecommendationCards
  settings/           # ApiKeyForm
lib/
  transform.ts        # OpenAI API response → UsageRow[]
  excel.ts            # SheetJS workbook builder
store/
  useDashboard.ts     # Zustand state (rows, summary, recommendations)
types/index.ts        # Shared TypeScript types
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phase plan:

- **Phase 1 (current):** OpenAI prototype with charts, Excel export, Haiku recommendations
- **Phase 2:** Anthropic, Google Vertex AI, AWS Bedrock
- **Phase 3:** Budget alerts, forecasting, anomaly detection
- **Phase 4:** Multi-user auth, org-level rollup, cost allocation tagging

## Security

- API keys transmitted over HTTPS only, never in query strings
- Server-side proxy routes prevent keys from appearing in browser network logs
- `.env.local` and `.env*` are gitignored
- No PII sent to Claude Haiku — only aggregated cost/token numbers
