import { describe, it, expect } from "vitest";
import { normalizeModelName } from "@/lib/router/normalize";

describe("normalizeModelName", () => {
  it("passes through a canonical model ID unchanged", () => {
    const r = normalizeModelName("gpt-4o-mini");
    expect(r.modelId).toBe("gpt-4o-mini");
    expect(r.isAlias).toBe(false);
    expect(r.provider).toBe("openai");
  });

  it("normalizes openai/ prefix", () => {
    const r = normalizeModelName("openai/gpt-4o");
    expect(r.modelId).toBe("gpt-4o");
    expect(r.provider).toBe("openai");
    expect(r.isAlias).toBe(true);
    expect(r.originalName).toBe("openai/gpt-4o");
  });

  it("normalizes anthropic/ prefix", () => {
    const r = normalizeModelName("anthropic/claude-sonnet-4-6");
    expect(r.modelId).toBe("claude-sonnet-4-6");
    expect(r.provider).toBe("anthropic");
    expect(r.isAlias).toBe(true);
  });

  it("normalizes legacy claude-3 names", () => {
    const r = normalizeModelName("claude-3-haiku-20240307");
    expect(r.modelId).toBe("claude-haiku-4-5-20251001");
    expect(r.isAlias).toBe(true);
  });

  it("normalizes gpt-3.5-turbo to gpt-4.1-nano", () => {
    const r = normalizeModelName("gpt-3.5-turbo");
    expect(r.modelId).toBe("gpt-4.1-nano");
    expect(r.isAlias).toBe(true);
  });

  it("normalizes litellm/ prefix", () => {
    const r = normalizeModelName("litellm/gpt-4o-mini");
    expect(r.modelId).toBe("gpt-4o-mini");
    expect(r.provider).toBe("openai");
    expect(r.isAlias).toBe(true);
  });

  it("handles groq/ prefix for llama models", () => {
    const r = normalizeModelName("groq/llama-3.3-70b");
    expect(r.modelId).toBe("llama-3.3-70b-versatile");
    expect(r.provider).toBe("groq");
  });

  it("marks azure/ prefix as custom endpoint", () => {
    const r = normalizeModelName("azure/my-gpt4-deployment");
    expect(r.modelId).toBe("my-gpt4-deployment");
    expect(r.provider).toBe("azure");
    expect(r.isCustomEndpoint).toBe(true);
  });

  it("marks bedrock/ prefix as custom endpoint", () => {
    const r = normalizeModelName("bedrock/claude-sonnet-4");
    expect(r.modelId).toBe("claude-sonnet-4");
    expect(r.provider).toBe("bedrock");
    expect(r.isCustomEndpoint).toBe(true);
  });

  it("preserves originalName on aliased models", () => {
    const r = normalizeModelName("openai/gpt-4-turbo");
    expect(r.originalName).toBe("openai/gpt-4-turbo");
  });

  it("infers anthropic provider for claude- prefix", () => {
    const r = normalizeModelName("claude-sonnet-4-6");
    expect(r.provider).toBe("anthropic");
  });

  it("infers google provider for gemini- prefix", () => {
    const r = normalizeModelName("gemini-2.0-flash");
    expect(r.provider).toBe("google");
  });

  it("passes through unknown provider/model without alias", () => {
    const r = normalizeModelName("somevendor/some-model-v1");
    expect(r.modelId).toBe("some-model-v1");
    expect(r.provider).toBe("somevendor");
    expect(r.isAlias).toBe(false);
  });
});
