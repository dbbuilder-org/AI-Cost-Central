/**
 * SmartRouter type definitions.
 */

export type TaskType =
  | "chat"
  | "coding"
  | "reasoning"
  | "extraction"
  | "classification"
  | "summarization"
  | "generation"
  | "embedding"
  | "vision";

export type QualityTier = "economy" | "balanced" | "quality" | "max";

export type ProviderName = "openai" | "anthropic" | "google" | "groq" | "mistral";

// ── Classification ──────────────────────────────────────────────────────────

export interface ClassificationResult {
  taskType: TaskType;
  confidence: number;          // 0-100
  signals: string[];           // human-readable signals that drove the classification
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  requiresVision: boolean;
  requiresJsonMode: boolean;
  requiresFunctionCalling: boolean;
}

// ── Routing ─────────────────────────────────────────────────────────────────

export interface RoutingCandidate {
  modelId: string;
  provider: ProviderName;
  qualityScore: number;        // 0-100 quality for this task type
  estimatedCostUSD: number;
  costEfficiencyScore: number; // quality / (cost * 1000 + 0.01)
  finalScore: number;
  reason: string;
}

export interface RoutingDecision {
  winner: RoutingCandidate;
  candidates: RoutingCandidate[];  // top N considered
  modelRequested: string;
  taskType: TaskType;
  estimatedSavingsUSD: number;
  estimatedSavingsPct: number;
}

// ── Model catalog ────────────────────────────────────────────────────────────

export interface ModelCapabilities {
  modelId: string;
  provider: ProviderName;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  qualityScores: Partial<Record<TaskType, number>>;
}

export interface ModelPricing {
  modelId: string;
  inputPer1M: number;   // USD
  outputPer1M: number;  // USD
  cacheReadPer1M?: number;
  updatedAt: string;    // ISO date
}

// ── Project / virtual key config ─────────────────────────────────────────────

export interface ProjectRoutingRules {
  projectId: string;
  orgId: string;
  qualityTier: QualityTier;
  allowedProviders?: ProviderName[];
  taskOverrides?: Partial<Record<TaskType, string>>; // taskType → specific modelId
  budgetDailyUSD?: number;
  budgetMonthlyUSD?: number;
}

export interface RoutingContext {
  projectId: string;
  orgId: string;
  qualityTier: QualityTier;
  passthrough: boolean;
  providerKey: string | null;
  provider: string;
}

// ── OpenAI-compatible wire types ──────────────────────────────────────────────

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "text" | "json_object" };
  tools?: unknown[];
  tool_choice?: unknown;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
}
