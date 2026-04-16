import { describe, it, expect } from "vitest";
import { injectAnthropicCacheControl, extractCacheReadTokens } from "@/lib/router/cache";

describe("injectAnthropicCacheControl", () => {
  const longText = "x".repeat(4200); // > 1024 tokens (4 chars/token)

  it("returns messages unchanged for non-anthropic provider", () => {
    const msgs = [{ role: "system", content: longText }, { role: "user", content: "hi" }];
    const result = injectAnthropicCacheControl(msgs, "openai", true);
    expect(result).toEqual(msgs);
  });

  it("returns messages unchanged when caching disabled", () => {
    const msgs = [{ role: "system", content: longText }];
    const result = injectAnthropicCacheControl(msgs, "anthropic", false);
    expect(result).toEqual(msgs);
  });

  it("returns messages unchanged when system prompt is short", () => {
    const msgs = [{ role: "system", content: "short" }, { role: "user", content: "hi" }];
    const result = injectAnthropicCacheControl(msgs, "anthropic", true);
    expect(result).toEqual(msgs);
  });

  it("injects cache_control on a long string system prompt", () => {
    const msgs = [{ role: "system", content: longText }, { role: "user", content: "hi" }];
    const result = injectAnthropicCacheControl(msgs, "anthropic", true);
    const sys = result[0];
    expect(Array.isArray(sys.content)).toBe(true);
    const block = (sys.content as Array<Record<string, unknown>>)[0];
    expect(block.cache_control).toEqual({ type: "ephemeral" });
    expect(block.text).toBe(longText);
  });

  it("injects cache_control on last block of array content", () => {
    const msgs = [
      {
        role: "system",
        content: [
          { type: "text", text: longText },
          { type: "text", text: longText },
        ],
      },
    ];
    const result = injectAnthropicCacheControl(msgs, "anthropic", true);
    const blocks = result[0].content as Array<Record<string, unknown>>;
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("does not mutate the original messages array", () => {
    const msgs = [{ role: "system", content: longText }];
    injectAnthropicCacheControl(msgs, "anthropic", true);
    expect(typeof msgs[0].content).toBe("string");
  });
});

describe("extractCacheReadTokens", () => {
  it("returns 0 for non-anthropic provider", () => {
    expect(extractCacheReadTokens({ usage: { cache_read_input_tokens: 100 } }, "openai")).toBe(0);
  });

  it("returns 0 when no cache read tokens present", () => {
    expect(extractCacheReadTokens({ usage: {} }, "anthropic")).toBe(0);
  });

  it("returns cache_read_input_tokens for anthropic", () => {
    expect(extractCacheReadTokens({ usage: { cache_read_input_tokens: 500 } }, "anthropic")).toBe(500);
  });

  it("returns 0 on malformed response", () => {
    expect(extractCacheReadTokens(null, "anthropic")).toBe(0);
  });
});
