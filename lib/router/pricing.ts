/**
 * Model pricing catalog — seeded from known prices (Apr 2026).
 * Updated by cron job from LiteLLM OSS pricing DB.
 */
import type { ModelCapabilities } from "@/types/router";

export interface PricingEntry {
  modelId: string;
  provider: string;
  displayName: string;
  inputPer1M: number;   // USD
  outputPer1M: number;  // USD
  cacheReadPer1M?: number;
  contextWindow: number;
  maxOutputTokens?: number;
}

// Seed pricing — updated via /api/cron/pricing
export const PRICING_CATALOG: PricingEntry[] = [
  // ── OpenAI ──
  { modelId: "gpt-4.1-nano",           provider: "openai", displayName: "GPT-4.1 Nano",     inputPer1M: 0.10,  outputPer1M: 0.40,  cacheReadPer1M: 0.025, contextWindow: 1_000_000 },
  { modelId: "gpt-4o-mini",            provider: "openai", displayName: "GPT-4o Mini",       inputPer1M: 0.15,  outputPer1M: 0.60,  cacheReadPer1M: 0.075, contextWindow: 128_000 },
  { modelId: "gpt-4o-mini-2024-07-18", provider: "openai", displayName: "GPT-4o Mini",       inputPer1M: 0.15,  outputPer1M: 0.60,  cacheReadPer1M: 0.075, contextWindow: 128_000 },
  { modelId: "gpt-4.1-mini",           provider: "openai", displayName: "GPT-4.1 Mini",      inputPer1M: 0.40,  outputPer1M: 1.60,  cacheReadPer1M: 0.10,  contextWindow: 1_000_000 },
  { modelId: "gpt-4o",                 provider: "openai", displayName: "GPT-4o",            inputPer1M: 2.50,  outputPer1M: 10.00, cacheReadPer1M: 1.25,  contextWindow: 128_000 },
  { modelId: "gpt-4o-2024-08-06",      provider: "openai", displayName: "GPT-4o Aug 2024",   inputPer1M: 2.50,  outputPer1M: 10.00, cacheReadPer1M: 1.25,  contextWindow: 128_000 },
  { modelId: "gpt-4.1",                provider: "openai", displayName: "GPT-4.1",           inputPer1M: 2.00,  outputPer1M: 8.00,  cacheReadPer1M: 0.50,  contextWindow: 1_000_000 },
  { modelId: "gpt-4.1-2025-04-14",     provider: "openai", displayName: "GPT-4.1",           inputPer1M: 2.00,  outputPer1M: 8.00,  cacheReadPer1M: 0.50,  contextWindow: 1_000_000 },
  { modelId: "o3-mini",                provider: "openai", displayName: "o3-mini",            inputPer1M: 1.10,  outputPer1M: 4.40,  contextWindow: 200_000 },
  { modelId: "o3",                     provider: "openai", displayName: "o3",                 inputPer1M: 10.00, outputPer1M: 40.00, contextWindow: 200_000 },
  { modelId: "o4-mini",                provider: "openai", displayName: "o4-mini",            inputPer1M: 1.10,  outputPer1M: 4.40,  contextWindow: 200_000 },
  { modelId: "text-embedding-3-small", provider: "openai", displayName: "Embedding 3 Small",  inputPer1M: 0.02,  outputPer1M: 0,     contextWindow: 8_191 },
  { modelId: "text-embedding-3-large", provider: "openai", displayName: "Embedding 3 Large",  inputPer1M: 0.13,  outputPer1M: 0,     contextWindow: 8_191 },
  // ── Anthropic ──
  { modelId: "claude-haiku-4-5-20251001", provider: "anthropic", displayName: "Claude Haiku 4.5", inputPer1M: 1.00, outputPer1M: 5.00, cacheReadPer1M: 0.10, contextWindow: 200_000 },
  { modelId: "claude-sonnet-4-6",         provider: "anthropic", displayName: "Claude Sonnet 4.6", inputPer1M: 3.00, outputPer1M: 15.00, cacheReadPer1M: 0.30, contextWindow: 200_000 },
  { modelId: "claude-opus-4-6",           provider: "anthropic", displayName: "Claude Opus 4.6",   inputPer1M: 15.00, outputPer1M: 75.00, cacheReadPer1M: 1.50, contextWindow: 200_000 },
  // ── Google ──
  { modelId: "gemini-2.0-flash",         provider: "google", displayName: "Gemini 2.0 Flash",    inputPer1M: 0.10, outputPer1M: 0.40, contextWindow: 1_000_000 },
  { modelId: "gemini-2.5-pro",           provider: "google", displayName: "Gemini 2.5 Pro",      inputPer1M: 1.25, outputPer1M: 10.00, contextWindow: 1_000_000 },
  { modelId: "gemini-1.5-flash-8b",      provider: "google", displayName: "Gemini 1.5 Flash 8B", inputPer1M: 0.0375, outputPer1M: 0.15, contextWindow: 1_000_000 },
  // ── Groq ──
  { modelId: "llama-3.3-70b-versatile",  provider: "groq", displayName: "Llama 3.3 70B (Groq)", inputPer1M: 0.59, outputPer1M: 0.79, contextWindow: 128_000 },
  { modelId: "llama-3.1-8b-instant",     provider: "groq", displayName: "Llama 3.1 8B (Groq)",  inputPer1M: 0.05, outputPer1M: 0.08, contextWindow: 128_000 },
  // ── Mistral ──
  { modelId: "mistral-large-latest",     provider: "mistral", displayName: "Mistral Large",      inputPer1M: 2.00, outputPer1M: 6.00, contextWindow: 128_000 },
  { modelId: "mistral-small-latest",     provider: "mistral", displayName: "Mistral Small",      inputPer1M: 0.20, outputPer1M: 0.60, contextWindow: 32_000 },
  { modelId: "ministral-8b-latest",      provider: "mistral", displayName: "Ministral 8B",       inputPer1M: 0.10, outputPer1M: 0.10, contextWindow: 128_000 },
];

export function getPricing(modelId: string): PricingEntry | undefined {
  return PRICING_CATALOG.find(
    (p) => p.modelId === modelId || modelId.startsWith(p.modelId)
  );
}

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = getPricing(modelId);
  if (!p) return 0;
  return (p.inputPer1M / 1_000_000) * inputTokens + (p.outputPer1M / 1_000_000) * outputTokens;
}

// Quality scores by task type per model (0-100)
export const QUALITY_SCORES: Record<string, ModelCapabilities["qualityScores"]> = {
  "gpt-4.1-nano":            { extraction: 90, classification: 88, summarization: 82, generation: 72, coding: 80, reasoning: 68, chat: 78, embedding: 0, vision: 0 },
  "gpt-4o-mini":             { extraction: 88, classification: 87, summarization: 85, generation: 78, coding: 84, reasoning: 72, chat: 82, embedding: 0, vision: 75 },
  "gpt-4.1-mini":            { extraction: 91, classification: 90, summarization: 88, generation: 82, coding: 88, reasoning: 78, chat: 85, embedding: 0, vision: 78 },
  "gpt-4o":                  { extraction: 94, classification: 93, summarization: 92, generation: 90, coding: 93, reasoning: 88, chat: 92, embedding: 0, vision: 92 },
  "gpt-4.1":                 { extraction: 95, classification: 94, summarization: 93, generation: 91, coding: 94, reasoning: 90, chat: 93, embedding: 0, vision: 90 },
  "o3-mini":                 { extraction: 85, classification: 83, summarization: 80, generation: 75, coding: 90, reasoning: 97, chat: 78, embedding: 0, vision: 0 },
  "o3":                      { extraction: 90, classification: 88, summarization: 85, generation: 82, coding: 95, reasoning: 99, chat: 84, embedding: 0, vision: 0 },
  "claude-haiku-4-5-20251001": { extraction: 89, classification: 88, summarization: 87, generation: 83, coding: 85, reasoning: 76, chat: 86, embedding: 0, vision: 0 },
  "claude-sonnet-4-6":       { extraction: 93, classification: 92, summarization: 93, generation: 92, coding: 93, reasoning: 90, chat: 92, embedding: 0, vision: 88 },
  "gemini-2.0-flash":        { extraction: 88, classification: 87, summarization: 86, generation: 80, coding: 82, reasoning: 78, chat: 84, embedding: 0, vision: 85 },
  "llama-3.3-70b-versatile": { extraction: 83, classification: 82, summarization: 82, generation: 75, coding: 80, reasoning: 72, chat: 80, embedding: 0, vision: 0 },
  "llama-3.1-8b-instant":    { extraction: 74, classification: 73, summarization: 72, generation: 65, coding: 68, reasoning: 60, chat: 70, embedding: 0, vision: 0 },
};
