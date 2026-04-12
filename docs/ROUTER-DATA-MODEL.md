# SmartRouter — Data Model

## Entity Hierarchy

```
Organization
  └── Projects (1:N)
        ├── RoutingRules (1:1 per project)
        ├── VirtualKeys (1:N) ← what clients use to call SmartRouter
        ├── ProviderKeys (1:N) ← BYOK: their OpenAI/Anthropic/etc keys
        └── RepoLinks (1:N) ← GitHub repos tied to this project

RequestLog (time-series, heavy write)
RoutingDecision (per request, references RequestLog)
ModelPricing (catalog, updated 6h)
ModelCapabilities (catalog, mostly static)
```

---

## SQL Schema (Postgres / Neon)

```sql
-- ─────────────────────────────────────────
-- ORGANIZATIONS & PROJECTS
-- ─────────────────────────────────────────

CREATE TABLE organizations (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  github_repo   TEXT,                    -- default repo for all keys in project
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- ROUTING RULES (per project)
-- ─────────────────────────────────────────

CREATE TABLE routing_rules (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Budget controls
  daily_budget_usd NUMERIC(10,4),        -- NULL = unlimited
  monthly_budget_usd NUMERIC(10,4),
  -- Quality tier: determines which quality score floor to apply
  quality_tier     TEXT NOT NULL DEFAULT 'balanced'
                   CHECK (quality_tier IN ('economy', 'balanced', 'quality', 'max')),
  -- Per task-type overrides (JSON map of task_type → model_id)
  task_overrides   JSONB DEFAULT '{}',   -- e.g. {"coding": "claude-sonnet-4-6", "reasoning": "o3-mini"}
  -- Allowed providers (NULL = all)
  allowed_providers TEXT[],              -- e.g. ARRAY['openai', 'anthropic']
  -- Pass-through: don't reroute, just log
  passthrough      BOOLEAN DEFAULT FALSE,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

-- ─────────────────────────────────────────
-- VIRTUAL KEYS (what clients use)
-- ─────────────────────────────────────────

CREATE TABLE virtual_keys (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,    -- SHA-256 of the actual key (never store plaintext)
  key_prefix    TEXT NOT NULL,           -- e.g. "sk-sr-abc1" for display
  name          TEXT NOT NULL,
  github_repo   TEXT,                    -- repo override at key level
  github_path   TEXT,                    -- narrow to specific path in repo
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  -- Per-key budget override (takes precedence over project)
  daily_budget_usd  NUMERIC(10,4),
  quality_tier_override TEXT CHECK (quality_tier_override IN ('economy', 'balanced', 'quality', 'max', NULL))
);

-- ─────────────────────────────────────────
-- PROVIDER KEYS (BYOK — encrypted at rest)
-- ─────────────────────────────────────────

CREATE TABLE provider_keys (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'groq', 'mistral', 'together')),
  key_encrypted TEXT NOT NULL,           -- AES-256-GCM encrypted, key in env
  key_prefix    TEXT NOT NULL,           -- e.g. "sk-...abc1" for display
  name          TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  -- Rate limit config for this key
  rpm_limit     INTEGER,
  tpm_limit     INTEGER
);

-- ─────────────────────────────────────────
-- REPO LINKS (key → GitHub repo mapping)
-- ─────────────────────────────────────────

CREATE TABLE repo_links (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  virtual_key_id  TEXT REFERENCES virtual_keys(id) ON DELETE CASCADE,
  -- Exactly one of project_id or virtual_key_id must be set
  CHECK (
    (project_id IS NOT NULL AND virtual_key_id IS NULL) OR
    (project_id IS NULL AND virtual_key_id IS NOT NULL)
  ),
  github_owner    TEXT NOT NULL,          -- e.g. "dbbuilder-org"
  github_repo     TEXT NOT NULL,          -- e.g. "UpApply"
  path_filter     TEXT,                   -- e.g. "api/app/services" (optional)
  display_name    TEXT,                   -- e.g. "UpApply backend"
  last_scanned_at TIMESTAMPTZ,
  scan_cache      JSONB,                  -- cached GitHub search results
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- MODEL CATALOG
-- ─────────────────────────────────────────

CREATE TABLE models (
  id                TEXT PRIMARY KEY,    -- e.g. "gpt-4.1-nano", "claude-haiku-4-5-20251001"
  provider          TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  context_window    INTEGER NOT NULL,
  max_output_tokens INTEGER,
  -- Capabilities (booleans)
  supports_vision       BOOLEAN DEFAULT FALSE,
  supports_function_calling BOOLEAN DEFAULT TRUE,
  supports_json_mode    BOOLEAN DEFAULT FALSE,
  supports_streaming    BOOLEAN DEFAULT TRUE,
  supports_system_prompt BOOLEAN DEFAULT TRUE,
  -- Classification
  tier              TEXT CHECK (tier IN ('nano', 'mini', 'standard', 'frontier', 'reasoning')),
  is_active         BOOLEAN DEFAULT TRUE,
  released_at       DATE,
  -- Quality scores by task type (0-100)
  quality_extraction    SMALLINT,
  quality_classification SMALLINT,
  quality_summarization SMALLINT,
  quality_generation    SMALLINT,
  quality_coding        SMALLINT,
  quality_reasoning     SMALLINT,
  quality_chat          SMALLINT,
  -- Meta
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE model_pricing (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id            TEXT NOT NULL REFERENCES models(id),
  -- Prices in USD per 1M tokens
  input_per_1m        NUMERIC(10,6) NOT NULL,
  output_per_1m       NUMERIC(10,6) NOT NULL,
  cache_read_per_1m   NUMERIC(10,6),     -- prompt caching read price
  cache_write_per_1m  NUMERIC(10,6),     -- prompt caching write price
  -- Source and validity
  source              TEXT DEFAULT 'manual', -- 'manual', 'litellm_db', 'provider_api'
  effective_from      TIMESTAMPTZ DEFAULT NOW(),
  effective_to        TIMESTAMPTZ,        -- NULL = current
  fetched_at          TIMESTAMPTZ DEFAULT NOW()
);

-- View for current pricing
CREATE VIEW current_pricing AS
SELECT m.*, mp.input_per_1m, mp.output_per_1m,
       mp.cache_read_per_1m, mp.cache_write_per_1m
FROM models m
JOIN model_pricing mp ON mp.model_id = m.id AND mp.effective_to IS NULL
WHERE m.is_active = TRUE;

-- ─────────────────────────────────────────
-- REQUEST LOGS (time-series, append-only)
-- ─────────────────────────────────────────

CREATE TABLE request_logs (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifiers
  org_id              TEXT NOT NULL,
  project_id          TEXT NOT NULL,
  virtual_key_id      TEXT,
  -- Request details
  model_requested     TEXT NOT NULL,     -- what the client asked for
  model_used          TEXT NOT NULL,     -- what we actually called
  provider_used       TEXT NOT NULL,
  task_type           TEXT,              -- classifier result
  task_confidence     SMALLINT,          -- 0-100 classifier confidence
  -- Token accounting
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER DEFAULT 0,
  -- Cost accounting
  cost_usd            NUMERIC(12,8) NOT NULL DEFAULT 0,
  cost_if_requested   NUMERIC(12,8),    -- cost if we'd used model_requested
  savings_usd         NUMERIC(12,8),    -- cost_if_requested - cost_usd
  -- Performance
  latency_ms          INTEGER,
  time_to_first_token_ms INTEGER,
  -- Outcome
  success             BOOLEAN NOT NULL DEFAULT TRUE,
  error_code          TEXT,
  error_message       TEXT,
  -- Metadata
  client_ip_hash      TEXT,             -- hashed for privacy
  user_agent          TEXT,
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (timestamp);

-- Monthly partitions
CREATE TABLE request_logs_2026_04 PARTITION OF request_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- (additional partitions added by cron)

CREATE INDEX idx_request_logs_org_ts ON request_logs (org_id, timestamp DESC);
CREATE INDEX idx_request_logs_project_ts ON request_logs (project_id, timestamp DESC);
CREATE INDEX idx_request_logs_key_ts ON request_logs (virtual_key_id, timestamp DESC);
CREATE INDEX idx_request_logs_model ON request_logs (model_used, timestamp DESC);

-- ─────────────────────────────────────────
-- ROUTING DECISIONS (detail per request)
-- ─────────────────────────────────────────

CREATE TABLE routing_decisions (
  request_id          TEXT PRIMARY KEY REFERENCES request_logs(id),
  -- What the classifier saw
  task_signals        JSONB,             -- raw signals that led to classification
  -- Candidates considered
  candidates          JSONB NOT NULL,    -- [{model, score, cost_est, reason}]
  winner              TEXT NOT NULL,
  winner_reason       TEXT,
  -- Override tracking
  was_overridden      BOOLEAN DEFAULT FALSE,
  override_reason     TEXT               -- 'budget_ceiling', 'task_rule', 'passthrough'
);

-- ─────────────────────────────────────────
-- AGGREGATES (pre-computed, updated by cron)
-- ─────────────────────────────────────────

CREATE TABLE daily_aggregates (
  date                DATE NOT NULL,
  org_id              TEXT NOT NULL,
  project_id          TEXT,
  virtual_key_id      TEXT,
  model_used          TEXT,
  task_type           TEXT,
  -- Counts
  request_count       INTEGER NOT NULL DEFAULT 0,
  success_count       INTEGER NOT NULL DEFAULT 0,
  -- Tokens
  input_tokens        BIGINT NOT NULL DEFAULT 0,
  output_tokens       BIGINT NOT NULL DEFAULT 0,
  -- Costs
  cost_usd            NUMERIC(14,6) NOT NULL DEFAULT 0,
  savings_usd         NUMERIC(14,6) NOT NULL DEFAULT 0,
  -- Performance
  avg_latency_ms      INTEGER,
  PRIMARY KEY (date, org_id, COALESCE(project_id,''), COALESCE(virtual_key_id,''),
               COALESCE(model_used,''), COALESCE(task_type,''))
);
```

---

## Vercel KV Schema (hot-path cache)

```
# Virtual key lookup (sub-ms auth)
vk:{key_hash} → { project_id, org_id, quality_tier, daily_budget, is_active }
TTL: 5 minutes

# Project routing rules (hot-path routing)
rules:{project_id} → RoutingRules JSON
TTL: 1 minute

# Provider key retrieval (per provider per project)
pk:{project_id}:{provider} → encrypted_key (decrypted in-process)
TTL: 10 minutes

# Current model pricing (all models)
pricing:catalog → ModelPricing[]
TTL: 6 hours

# Daily budget tracking (real-time spend counter)
budget:{project_id}:{YYYY-MM-DD} → spend_usd (INCRBYFLOAT)
TTL: 25 hours

# Repo scan cache (GitHub code search results)
repo:{owner}/{repo}:{path_filter_hash} → CodeScanResult
TTL: 6 hours
```

---

## TypeScript Types

```typescript
// types/router.ts

export type Provider = "openai" | "anthropic" | "google" | "groq" | "mistral" | "together";

export type TaskType =
  | "extraction"
  | "classification"
  | "summarization"
  | "generation"
  | "coding"
  | "reasoning"
  | "chat"
  | "embedding"
  | "vision";

export type QualityTier = "economy" | "balanced" | "quality" | "max";

export interface RoutingContext {
  orgId: string;
  projectId: string;
  virtualKeyId: string;
  rules: ProjectRoutingRules;
  pricing: Map<string, ModelPricing>;
}

export interface ProjectRoutingRules {
  qualityTier: QualityTier;
  dailyBudgetUSD: number | null;
  monthlyBudgetUSD: number | null;
  taskOverrides: Partial<Record<TaskType, string>>;   // task → model_id
  allowedProviders: Provider[] | null;
  passthrough: boolean;
}

export interface ModelPricing {
  modelId: string;
  provider: Provider;
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
}

export interface ModelCapabilities {
  modelId: string;
  provider: Provider;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  tier: "nano" | "mini" | "standard" | "frontier" | "reasoning";
  qualityScores: Record<TaskType, number>;  // 0-100
}

export interface ClassificationResult {
  taskType: TaskType;
  confidence: number;       // 0-100
  signals: string[];        // human-readable reasons
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  requiresVision: boolean;
  requiresJsonMode: boolean;
  requiresFunctionCalling: boolean;
}

export interface RoutingCandidate {
  modelId: string;
  provider: Provider;
  qualityScore: number;
  estimatedCostUSD: number;
  costEfficiencyScore: number;
  finalScore: number;
  reason: string;
}

export interface RoutingDecision {
  winner: RoutingCandidate;
  candidates: RoutingCandidate[];
  modelRequested: string;
  taskType: TaskType;
  estimatedSavingsUSD: number;
  estimatedSavingsPct: number;
}

// OpenAI-compatible request/response types (subset)
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "text" | "json_object" };
  tools?: Tool[];
  tool_choice?: string | object;
  // SmartRouter extensions (optional, ignored if unknown)
  "x-sr-quality-tier"?: QualityTier;
  "x-sr-task-type"?: TaskType;        // override classifier
  "x-sr-force-model"?: string;        // bypass routing
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}
```
