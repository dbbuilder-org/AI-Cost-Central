# SmartRouter — Architecture

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                                  │
│  App using OpenAI SDK / Anthropic SDK / raw HTTP                │
│  base_url = "https://router.aicostcentral.com/v1"              │
│  api_key  = "sk-sr-{virtual_key}"                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│                    GATEWAY LAYER  (Next.js / Edge)              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Auth & Rate  │  │ Virtual Key  │  │ Request Validator  │   │
│  │ Limiting     │  │ Resolver     │  │ (OpenAI schema)    │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘   │
│         └─────────────────┴──────────────────────┘             │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │              ROUTING ENGINE                              │   │
│  │                                                          │   │
│  │  1. Task Classifier                                      │   │
│  │     - Prompt heuristics (keywords, structure)            │   │
│  │     - Token count estimate                               │   │
│  │     - Request metadata (model requested, temperature)    │   │
│  │     → task_type: extraction|classification|generation|   │   │
│  │                  coding|reasoning|embedding|chat         │   │
│  │                                                          │   │
│  │  2. Candidate Selector                                   │   │
│  │     - Load project routing rules (from KV/DB)            │   │
│  │     - Filter by: capability requirements, context limit  │   │
│  │     - Score by: quality[task_type] × cost_efficiency     │   │
│  │     - Apply: budget ceiling, quality floor               │   │
│  │     → ranked candidate list                              │   │
│  │                                                          │   │
│  │  3. Decision Logger                                      │   │
│  │     - Record: request_id, candidates, winner, reason     │   │
│  │     - Async write to analytics store                     │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │              PROVIDER ADAPTERS                           │   │
│  │                                                          │   │
│  │  OpenAI  │ Anthropic  │ Google  │ Groq  │ Mistral       │   │
│  │  adapter │  adapter   │ adapter │ adptr │  adapter      │   │
│  │                                                          │   │
│  │  Each adapter:                                           │   │
│  │  - Translates OpenAI request → provider format          │   │
│  │  - Handles auth (BYOK keys from vault)                  │   │
│  │  - Streams response back                                 │   │
│  │  - Normalizes response → OpenAI format                  │   │
│  │  - Records actual token usage + latency                 │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │              RESPONSE NORMALIZER                         │   │
│  │  - Always returns OpenAI-schema JSON/SSE                │   │
│  │  - Injects x-smartrouter-* headers:                     │   │
│  │      model_used, task_type, cost_usd, savings_usd       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    ANALYTICS LAYER                               │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐   │
│  │  Request Logs   │    │  Pricing Updater (cron, 6h)      │   │
│  │  (Neon Postgres │    │  Fetches live pricing from:      │   │
│  │  or D1)         │    │  - OpenAI /models                │   │
│  │                 │    │  - Anthropic pricing page        │   │
│  │  + Aggregation  │    │  - LiteLLM pricing DB (OSS)      │   │
│  │    views for    │    │  Stores in: model_pricing table  │   │
│  │    dashboard    │    └──────────────────────────────────┘   │
│  └─────────────────┘                                            │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AICostCentral Dashboard (existing)                       │  │
│  │  + SmartRouter tab: routing decisions, savings, rules     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Request Flow — Detailed

```
POST /v1/chat/completions
  Authorization: Bearer sk-sr-abc123
  {
    "model": "gpt-4o",          ← user requested frontier
    "messages": [...],
    "temperature": 0.2,
    "response_format": {"type": "json_object"}
  }

Step 1 — Auth
  virtual_key "sk-sr-abc123" → project_id "proj_xyz", org_id "org_123"
  rate_limit check → pass

Step 2 — Task Classification
  Signals analyzed:
    - temperature: 0.2 (low → deterministic/extraction)
    - response_format: json_object → structured extraction
    - message[0].content length: 847 tokens
    - keywords: "extract", "return JSON", "fields:" → extraction pattern
  Result: task_type = "extraction", complexity = "simple"

Step 3 — Route Selection
  Project rules: quality_tier = "balanced", daily_budget = $5.00
  Candidates for task_type="extraction", needs json_mode:
    1. gpt-4.1-nano   $0.10/$0.40 per 1M  quality[extraction]=92  score=9.8
    2. gpt-4o-mini    $0.15/$0.60 per 1M  quality[extraction]=90  score=7.2
    3. gpt-4o         $2.50/$10   per 1M  quality[extraction]=95  score=2.1
  Winner: gpt-4.1-nano
  Savings vs requested (gpt-4o): 96%

Step 4 — Provider Call
  OpenAI adapter → POST api.openai.com/v1/chat/completions
    model: "gpt-4.1-nano"
    (all other params forwarded as-is)

Step 5 — Response
  HTTP 200 with OpenAI-format body
  Extra headers:
    x-sr-model-used: gpt-4.1-nano
    x-sr-model-requested: gpt-4o
    x-sr-task-type: extraction
    x-sr-cost-usd: 0.000094
    x-sr-savings-usd: 0.002256
    x-sr-savings-pct: 96

Step 6 — Async Log
  INSERT INTO request_logs (request_id, org_id, project_id, virtual_key_id,
    model_requested, model_used, task_type, input_tokens, output_tokens,
    cost_usd, savings_usd, latency_ms, success, timestamp)
```

## Task Classifier Design

```typescript
type TaskType =
  | "extraction"      // JSON extraction, field parsing, entity recognition
  | "classification"  // labeling, routing, scoring, sentiment
  | "summarization"   // condense long content → shorter
  | "generation"      // creative writing, marketing copy, cover letters
  | "coding"          // write/fix/explain code
  | "reasoning"       // multi-step logic, math, planning
  | "chat"            // conversational, open-ended
  | "embedding"       // vector embedding (separate path)
  | "vision"          // image analysis (requires vision model)

// Heuristic signals → task type mapping
const SIGNALS = {
  extraction: [
    /response_format.*json/i,        // json_mode requested
    /extract|parse|identify fields/i, // prompt keywords
    /return.*json|output.*json/i,
    temperature < 0.3,               // deterministic
  ],
  classification: [
    /classify|categorize|label|score|rate \d+-\d+/i,
    /choose one of|select from|pick the best/i,
    max_tokens < 50,                 // short expected output
  ],
  coding: [
    /```|function|class |def |import /,
    /write.*code|fix.*bug|implement/i,
    /typescript|python|javascript|sql/i,
  ],
  reasoning: [
    model in ["o1", "o3", "o4-mini"], // explicitly requested
    /step by step|think through|reason/i,
    /plan|strategy|analyze/i,
  ],
  generation: [
    temperature > 0.7,
    /write|draft|create|compose|generate/i,
    /essay|letter|email|blog|story/i,
  ],
}
```

## Quality Score Matrix (0-100)

| Model | Extract | Classify | Summarize | Generate | Code | Reason | Speed |
|-------|---------|----------|-----------|----------|------|--------|-------|
| gpt-4.1-nano | 90 | 88 | 82 | 72 | 80 | 68 | 95 |
| gpt-4o-mini | 88 | 87 | 85 | 78 | 84 | 72 | 90 |
| gpt-4.1-mini | 91 | 90 | 88 | 82 | 88 | 78 | 85 |
| gpt-4o | 94 | 93 | 92 | 90 | 93 | 88 | 75 |
| gpt-4.1 | 95 | 94 | 93 | 91 | 94 | 90 | 72 |
| o3-mini | 85 | 83 | 80 | 75 | 90 | 97 | 40 |
| claude-haiku-4.5 | 89 | 88 | 87 | 83 | 85 | 76 | 88 |
| claude-sonnet-4.6 | 93 | 92 | 93 | 92 | 93 | 90 | 70 |
| gemini-2.0-flash | 88 | 87 | 86 | 80 | 82 | 78 | 92 |
| llama-3.1-8b (Groq) | 80 | 79 | 78 | 72 | 75 | 65 | 99 |

*Scores are initial estimates; updated from benchmark results over time.*

## Deployment Architecture

```
Phase 1: Next.js monolith on Vercel
  - Router as Next.js API routes (/v1/chat/completions)
  - Vercel KV for: virtual keys, project rules, pricing cache
  - Vercel Postgres (Neon) for: request logs, analytics
  - Vercel Cron for: pricing updates (6h), analytics aggregation (1h)

Phase 2: Split architecture
  - Router → Cloudflare Workers (edge, low latency, global)
  - Dashboard → Next.js on Vercel
  - DB → Neon Postgres (serverless)
  - Cache → Upstash Redis (KV)

Phase 3: Full edge
  - Router at CF edge with Durable Objects for per-key rate limiting
  - Streaming via CF Workers → client
  - Analytics pipeline: CF Analytics Engine or ClickHouse
```
