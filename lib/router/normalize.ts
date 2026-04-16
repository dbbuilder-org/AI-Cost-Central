/**
 * Model name normalization (Phase 6).
 *
 * Handles multiple model name conventions:
 * 1. Direct model ID: "gpt-4o-mini"
 * 2. provider/model syntax: "openai/gpt-4o-mini", "anthropic/claude-haiku-4-5"
 * 3. LiteLLM model names: "gpt-4o", "claude-3-haiku-20240307" (mapped to current)
 * 4. OpenRouter model names: "openai/gpt-4o-mini", "anthropic/claude-3-haiku"
 * 5. Azure OpenAI deployments: "azure/my-deployment"
 *
 * Also handles OpenRouter-compatible request headers:
 * - HTTP-Referer → x-sr-referer (logged for attribution)
 * - X-Title → x-sr-title (logged for attribution)
 */

// LiteLLM / OpenRouter → AICostCentral canonical model ID mapping
const MODEL_ALIASES: Record<string, string> = {
  // OpenAI aliases
  "gpt-4o-mini-2024-07-18":      "gpt-4o-mini",
  "gpt-4-turbo":                 "gpt-4o",
  "gpt-4-turbo-preview":         "gpt-4o",
  "gpt-3.5-turbo":               "gpt-4.1-nano",
  "gpt-3.5-turbo-0125":          "gpt-4.1-nano",
  "openai/gpt-4o":               "gpt-4o",
  "openai/gpt-4o-mini":          "gpt-4o-mini",
  "openai/gpt-4-turbo":          "gpt-4o",
  "openai/gpt-3.5-turbo":        "gpt-4.1-nano",
  "openai/o3-mini":              "o3-mini",
  "openai/o3":                   "o3",
  "openai/o4-mini":              "o4-mini",
  "openai/gpt-4.1":              "gpt-4.1",
  "openai/gpt-4.1-mini":         "gpt-4.1-mini",
  "openai/gpt-4.1-nano":         "gpt-4.1-nano",
  // Anthropic aliases
  "claude-3-haiku-20240307":     "claude-haiku-4-5-20251001",
  "claude-3-5-haiku-20241022":   "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-20241022":  "claude-sonnet-4-6",
  "claude-3-5-sonnet-20240620":  "claude-sonnet-4-6",
  "claude-3-opus-20240229":      "claude-opus-4-6",
  "claude-haiku":                "claude-haiku-4-5-20251001",
  "claude-sonnet":               "claude-sonnet-4-6",
  "claude-opus":                 "claude-opus-4-6",
  "anthropic/claude-3-haiku":    "claude-haiku-4-5-20251001",
  "anthropic/claude-3-sonnet":   "claude-sonnet-4-6",
  "anthropic/claude-3-opus":     "claude-opus-4-6",
  "anthropic/claude-haiku-4-5":  "claude-haiku-4-5-20251001",
  "anthropic/claude-sonnet-4-6": "claude-sonnet-4-6",
  // Google aliases
  "gemini-pro":                  "gemini-2.0-flash",
  "gemini-1.5-flash":            "gemini-2.0-flash",
  "gemini-1.5-pro":              "gemini-2.5-pro",
  "google/gemini-flash":         "gemini-2.0-flash",
  "google/gemini-pro":           "gemini-2.5-pro",
  // Groq aliases
  "groq/llama-3.3-70b":         "llama-3.3-70b-versatile",
  "groq/llama-3.1-8b":          "llama-3.1-8b-instant",
  "groq/llama3-70b-8192":       "llama-3.3-70b-versatile",
  "groq/mixtral-8x7b":          "mixtral-8x7b-32768",
  // Mistral aliases
  "mistral/mistral-large":      "mistral-large-latest",
  "mistral/mistral-small":      "mistral-small-latest",
  "mistral-large":              "mistral-large-latest",
  "mistral-small":              "mistral-small-latest",
  // Cohere aliases
  "cohere/command-r-plus":      "command-r-plus",
  "cohere/command-r":           "command-r",
  // LiteLLM prefix strip
  "litellm/gpt-4o":             "gpt-4o",
  "litellm/gpt-4o-mini":        "gpt-4o-mini",
  "litellm/claude-3-haiku":     "claude-haiku-4-5-20251001",
  "litellm/claude-3-sonnet":    "claude-sonnet-4-6",
};

// Provider extracted from provider/model syntax
const PROVIDER_PREFIX_MAP: Record<string, string> = {
  "openai":    "openai",
  "anthropic": "anthropic",
  "google":    "google",
  "groq":      "groq",
  "mistral":   "mistral",
  "cohere":    "cohere",
  "bedrock":   "bedrock",
  "azure":     "azure",
  "litellm":   "openai", // LiteLLM defaults to OpenAI compat
};

export interface NormalizedModel {
  modelId: string;          // canonical AICostCentral model ID
  provider: string;         // canonical provider name
  isAlias: boolean;         // true if name was aliased
  originalName: string;     // the original model string
  isCustomEndpoint: boolean; // true if azure/bedrock/custom
}

/**
 * Normalize any model name string to a canonical model ID.
 * Returns the original string if no alias found.
 */
export function normalizeModelName(modelName: string): NormalizedModel {
  const original = modelName;

  // Direct alias lookup
  const alias = MODEL_ALIASES[modelName];
  if (alias) {
    const provider = inferProvider(alias);
    return { modelId: alias, provider, isAlias: true, originalName: original, isCustomEndpoint: false };
  }

  // provider/model prefix parsing
  const slashIdx = modelName.indexOf("/");
  if (slashIdx > 0) {
    const prefix = modelName.slice(0, slashIdx).toLowerCase();
    const afterSlash = modelName.slice(slashIdx + 1);

    // Azure / Bedrock deployments — custom endpoint
    if (prefix === "azure" || prefix === "bedrock") {
      return {
        modelId: afterSlash,
        provider: prefix,
        isAlias: false,
        originalName: original,
        isCustomEndpoint: true,
      };
    }

    // Check alias with prefix
    const withPrefix = MODEL_ALIASES[`${prefix}/${afterSlash}`];
    if (withPrefix) {
      const provider = PROVIDER_PREFIX_MAP[prefix] ?? prefix;
      return { modelId: withPrefix, provider, isAlias: true, originalName: original, isCustomEndpoint: false };
    }

    // Unknown provider/model — pass model through, infer provider from prefix
    const provider = PROVIDER_PREFIX_MAP[prefix] ?? prefix;
    return { modelId: afterSlash, provider, isAlias: false, originalName: original, isCustomEndpoint: false };
  }

  // No alias, no slash — return as-is
  const provider = inferProvider(modelName);
  return { modelId: modelName, provider, isAlias: false, originalName: original, isCustomEndpoint: false };
}

function inferProvider(modelId: string): string {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4") || modelId.startsWith("text-embedding-3")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("llama-") || modelId.startsWith("mixtral-")) return "groq";
  if (modelId.startsWith("mistral-") || modelId.startsWith("ministral-")) return "mistral";
  if (modelId.startsWith("command-")) return "cohere";
  return "openai";
}
