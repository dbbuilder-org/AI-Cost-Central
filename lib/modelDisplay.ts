/**
 * Model display utilities — brand colors, abbreviated labels, provider logos.
 *
 * Color system:
 *   OpenAI    → purple  (#7C3AED family), shaded light→dark by cost tier
 *   Anthropic → orange  (#EA580C family), shaded light→dark by cost tier
 *   Google    → blue    (#2563EB family), shaded light→dark by cost tier
 *   Groq      → emerald (#059669 family)
 *   Mistral   → cyan    (#0891B2 family)
 *   Cohere    → green   (#16A34A family)
 *   Bedrock   → amber   (#D97706 family)
 */

// ── Per-model color map ────────────────────────────────────────────────────────
// Ordered light→dark within each provider family (cheapest → most expensive).

const MODEL_COLOR_MAP: Record<string, string> = {
  // ── OpenAI (purple) ──
  "text-embedding-3-small":   "#DDD6FE",
  "text-embedding-3-large":   "#C4B5FD",
  "gpt-4.1-nano":             "#A78BFA",
  "gpt-4o-mini":              "#8B5CF6",
  "gpt-4o-mini-2024-07-18":   "#8B5CF6",
  "gpt-4.1-mini":             "#7C3AED",
  "o3-mini":                  "#6D28D9",
  "o4-mini":                  "#6D28D9",
  "gpt-4.1":                  "#5B21B6",
  "gpt-4.1-2025-04-14":       "#5B21B6",
  "gpt-4o":                   "#4C1D95",
  "gpt-4o-2024-08-06":        "#4C1D95",
  "o3":                       "#3B0764",

  // ── Anthropic (orange) ──
  "claude-haiku-4-5-20251001": "#FDBA74",
  "claude-haiku-4-5":          "#FB923C",
  "claude-sonnet-4-6":         "#EA580C",
  "claude-opus-4-6":           "#9A3412",

  // ── Google / Gemini (blue) ──
  "gemini-1.5-flash-8b":      "#BFDBFE",
  "gemini-2.0-flash":         "#60A5FA",
  "gemini-2.5-pro":           "#2563EB",

  // ── Groq (emerald) ──
  "llama-3.1-8b-instant":     "#A7F3D0",
  "mixtral-8x7b-32768":       "#6EE7B7",
  "llama-3.3-70b-versatile":  "#34D399",
  "llama-3.3-70b-specdec":    "#10B981",
  "llama-3.2-90b-vision":     "#059669",

  // ── Mistral (cyan) ──
  "ministral-8b-latest":      "#A5F3FC",
  "mistral-small-latest":     "#22D3EE",
  "codestral-latest":         "#06B6D4",
  "mistral-large-latest":     "#0E7490",

  // ── Cohere (green) ──
  "embed-english-v3":         "#BBF7D0",
  "embed-multilingual-v3":    "#86EFAC",
  "command-r":                "#4ADE80",
  "command-r-plus":           "#16A34A",

  // ── Bedrock (amber) ──
  "bedrock/llama-3-70b":      "#FDE68A",
  "bedrock/claude-haiku-3-5": "#FCD34D",
  "bedrock/claude-sonnet-4":  "#D97706",
};

// Fallback palette for unknown models (cycles through neutrals)
const FALLBACK_COLORS = ["#6B7280", "#9CA3AF", "#4B5563", "#D1D5DB", "#374151"];

export function getModelColor(modelId: string): string {
  if (MODEL_COLOR_MAP[modelId]) return MODEL_COLOR_MAP[modelId];
  // Fuzzy match — check if any known key is a prefix of the given modelId
  for (const [key, color] of Object.entries(MODEL_COLOR_MAP)) {
    if (modelId.startsWith(key) || key.startsWith(modelId.split("-").slice(0, 3).join("-"))) {
      return color;
    }
  }
  // Stable fallback based on string hash
  let hash = 0;
  for (const ch of modelId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

// ── Provider detection ─────────────────────────────────────────────────────────

export type Provider = "openai" | "anthropic" | "google" | "groq" | "mistral" | "cohere" | "bedrock" | "unknown";

export function getProvider(modelId: string): Provider {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o3") || modelId.startsWith("o4") || modelId.startsWith("text-embedding-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("llama-") || modelId.startsWith("mixtral-")) return "groq";
  if (modelId.startsWith("mistral-") || modelId.startsWith("ministral-") || modelId === "codestral-latest") return "mistral";
  if (modelId.startsWith("command-") || modelId.startsWith("embed-")) return "cohere";
  if (modelId.startsWith("bedrock/")) return "bedrock";
  return "unknown";
}

// ── Base provider colors (for provider-level UI) ───────────────────────────────

export const PROVIDER_BASE_COLORS: Record<Provider, string> = {
  openai:    "#7C3AED",
  anthropic: "#EA580C",
  google:    "#2563EB",
  groq:      "#059669",
  mistral:   "#0891B2",
  cohere:    "#16A34A",
  bedrock:   "#D97706",
  unknown:   "#6B7280",
};

// ── Provider logo config (small SVG badges) ────────────────────────────────────

export const PROVIDER_LOGO_CONFIG: Record<Provider, { bg: string; text: string }> = {
  openai:    { bg: "#5B21B6", text: "AI" },
  anthropic: { bg: "#C2410C", text: "An" },
  google:    { bg: "#1D4ED8", text: "G"  },
  groq:      { bg: "#047857", text: "Gq" },
  mistral:   { bg: "#0E7490", text: "Mi" },
  cohere:    { bg: "#15803D", text: "Co" },
  bedrock:   { bg: "#B45309", text: "Bk" },
  unknown:   { bg: "#4B5563", text: "?"  },
};

// ── Abbreviated display names ─────────────────────────────────────────────────
// Rule: provider prefix removed (replaced by logo in legend/chart),
//       date suffix removed, version number kept.

const ABBREV_MAP: Record<string, string> = {
  // OpenAI
  "gpt-4.1-nano":             "4.1 Nano",
  "gpt-4o-mini":              "4o Mini",
  "gpt-4o-mini-2024-07-18":   "4o Mini",
  "gpt-4.1-mini":             "4.1 Mini",
  "gpt-4o":                   "4o",
  "gpt-4o-2024-08-06":        "4o",
  "gpt-4.1":                  "4.1",
  "gpt-4.1-2025-04-14":       "4.1",
  "o3":                       "o3",
  "o3-mini":                  "o3-mini",
  "o4-mini":                  "o4-mini",
  "text-embedding-3-small":   "Embed 3 Sm",
  "text-embedding-3-large":   "Embed 3 Lg",
  // Anthropic
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-haiku-4-5":          "Haiku 4.5",
  "claude-sonnet-4-6":         "Sonnet 4.6",
  "claude-opus-4-6":           "Opus 4.6",
  // Google
  "gemini-2.0-flash":         "Flash 2.0",
  "gemini-2.5-pro":           "Pro 2.5",
  "gemini-1.5-flash-8b":      "Flash 1.5 8B",
  // Groq
  "llama-3.1-8b-instant":     "Llama 3.1 8B",
  "llama-3.3-70b-versatile":  "Llama 3.3 70B",
  "llama-3.3-70b-specdec":    "Llama 3.3 SD",
  "llama-3.2-90b-vision":     "Llama 3.2 90B",
  "mixtral-8x7b-32768":       "Mixtral 8x7B",
  // Mistral
  "mistral-large-latest":     "Mistral Lg",
  "mistral-small-latest":     "Mistral Sm",
  "ministral-8b-latest":      "Ministral 8B",
  "codestral-latest":         "Codestral",
  // Cohere
  "command-r-plus":           "Command R+",
  "command-r":                "Command R",
  "embed-english-v3":         "Embed EN v3",
  "embed-multilingual-v3":    "Embed ML v3",
  // Bedrock
  "bedrock/claude-sonnet-4":  "Sonnet 4 (B)",
  "bedrock/claude-haiku-3-5": "Haiku 3.5 (B)",
  "bedrock/llama-3-70b":      "Llama 3 70B (B)",
};

export function abbreviateModel(modelId: string): string {
  return ABBREV_MAP[modelId] ?? modelId;
}
