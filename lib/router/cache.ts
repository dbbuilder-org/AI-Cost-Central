/**
 * Prompt caching utilities for SmartRouter (Phase 5).
 *
 * Anthropic supports cache_control on system prompts and large context blocks.
 * When enabled, we inject {"cache_control": {"type": "ephemeral"}} on the last
 * system message (or any messages block > CACHE_MIN_TOKENS tokens).
 *
 * OpenAI does prompt caching automatically on inputs > 1024 tokens — no injection needed.
 * Google Gemini uses context caching via a separate API — not injected here.
 */

const CACHE_MIN_TOKENS = 1024; // Anthropic minimum for cache eligibility

// Rough token estimate: 1 token ≈ 4 chars
function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "object" && c !== null && "text" in c ? String((c as Record<string, unknown>).text) : ""))
      .join("");
  }
  return "";
}

type Message = { role: string; content: unknown };

/**
 * Inject Anthropic cache_control on eligible messages.
 * Returns modified messages array (original is not mutated).
 * Only modifies if provider === "anthropic" and the system prompt is large enough.
 */
export function injectAnthropicCacheControl(
  messages: Message[],
  provider: string,
  enabled: boolean
): Message[] {
  if (!enabled || provider !== "anthropic") return messages;

  // Find the last system message
  const systemIdx = messages.map((m, i) => (m.role === "system" ? i : -1)).filter((i) => i >= 0).pop();
  if (systemIdx === undefined) return messages;

  const systemMsg = messages[systemIdx];
  const text = extractText(systemMsg.content);
  if (roughTokenCount(text) < CACHE_MIN_TOKENS) return messages;

  // Inject cache_control on the system content block
  const patched = [...messages];
  if (typeof systemMsg.content === "string") {
    patched[systemIdx] = {
      ...systemMsg,
      content: [{ type: "text", text: systemMsg.content, cache_control: { type: "ephemeral" } }],
    };
  } else if (Array.isArray(systemMsg.content)) {
    const blocks = systemMsg.content as Array<Record<string, unknown>>;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && !lastBlock.cache_control) {
      const newBlocks = [...blocks];
      newBlocks[newBlocks.length - 1] = { ...lastBlock, cache_control: { type: "ephemeral" } };
      patched[systemIdx] = { ...systemMsg, content: newBlocks };
    }
  }

  return patched;
}

/**
 * Extract cache_read_input_tokens from Anthropic response usage.
 * Returns 0 for non-Anthropic providers.
 */
export function extractCacheReadTokens(responseData: unknown, provider: string): number {
  if (provider !== "anthropic") return 0;
  try {
    const data = responseData as { usage?: { cache_read_input_tokens?: number } };
    return data?.usage?.cache_read_input_tokens ?? 0;
  } catch {
    return 0;
  }
}
