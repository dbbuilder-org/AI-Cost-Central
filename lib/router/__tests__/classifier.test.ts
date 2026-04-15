import { describe, it, expect } from "vitest";
import { classifyRequest } from "@/lib/router/classifier";

function msgs(text: string) {
  return [{ role: "user", content: text }];
}

describe("classifyRequest", () => {
  // ── Vision ─────────────────────────────────────────────────────────────────
  it("classifies image_url messages as vision", () => {
    const result = classifyRequest({
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/img.png" } }] }],
    });
    expect(result.taskType).toBe("vision");
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.requiresVision).toBe(true);
  });

  // ── Embedding ───────────────────────────────────────────────────────────────
  it("classifies embedding model requests as embedding", () => {
    const result = classifyRequest({ model: "text-embedding-3-small", messages: msgs("embed this text") });
    expect(result.taskType).toBe("embedding");
    expect(result.confidence).toBeGreaterThanOrEqual(99);
  });

  it("classifies ada model as embedding", () => {
    const result = classifyRequest({ model: "text-embedding-ada-002", messages: msgs("embed") });
    expect(result.taskType).toBe("embedding");
  });

  // ── Reasoning ───────────────────────────────────────────────────────────────
  it("classifies o3-mini as reasoning", () => {
    const result = classifyRequest({ model: "o3-mini", messages: msgs("solve this math problem") });
    expect(result.taskType).toBe("reasoning");
  });

  it("classifies 'think carefully' phrasing as reasoning", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("think carefully about this problem and reason through all possibilities") });
    expect(result.taskType).toBe("reasoning");
  });

  // ── Extraction ──────────────────────────────────────────────────────────────
  it("classifies low-temp json_mode + extract keyword as extraction", () => {
    const result = classifyRequest({
      model: "gpt-4o",
      messages: msgs("extract all field values from this document"),
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    expect(result.taskType).toBe("extraction");
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.requiresJsonMode).toBe(true);
  });

  // ── Classification ──────────────────────────────────────────────────────────
  it("classifies 'classify' keyword as classification", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("classify this customer review as positive or negative") });
    expect(result.taskType).toBe("classification");
  });

  it("classifies very low max_tokens as classification", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("is this spam?"), max_tokens: 10 });
    expect(result.taskType).toBe("classification");
  });

  // ── Summarization ───────────────────────────────────────────────────────────
  it("classifies summarize keyword as summarization", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("summarize this 100-page report into key points") });
    expect(result.taskType).toBe("summarization");
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  it("classifies tldr keyword as summarization", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("tldr of this article") });
    expect(result.taskType).toBe("summarization");
  });

  // ── Coding ──────────────────────────────────────────────────────────────────
  it("classifies 'write code' as coding", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("write code to parse JSON in TypeScript") });
    expect(result.taskType).toBe("coding");
  });

  it("classifies message with code blocks as coding", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("```python\ndef foo():\n    pass\n``` fix the bug") });
    expect(result.taskType).toBe("coding");
  });

  // ── Generation ──────────────────────────────────────────────────────────────
  it("classifies high temperature as generation", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("tell me a story"), temperature: 0.9 });
    expect(result.taskType).toBe("generation");
  });

  it("classifies 'write an essay' as generation", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("write an essay about climate change") });
    expect(result.taskType).toBe("generation");
  });

  // ── Chat (default) ──────────────────────────────────────────────────────────
  it("defaults to chat for a generic question", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("what is the capital of France?"), temperature: 0.5 });
    expect(result.taskType).toBe("chat");
  });

  // ── Token estimation ─────────────────────────────────────────────────────────
  it("estimates tokens from message length", () => {
    const text = "a".repeat(400); // 400 chars ≈ 100 tokens
    const result = classifyRequest({ model: "gpt-4o", messages: msgs(text) });
    expect(result.estimatedInputTokens).toBeCloseTo(100, -1);
  });

  it("uses max_tokens for estimated output tokens when provided", () => {
    const result = classifyRequest({ model: "gpt-4o", messages: msgs("hello"), max_tokens: 200 });
    expect(result.estimatedOutputTokens).toBe(200);
  });

  // ── Tools ────────────────────────────────────────────────────────────────────
  it("detects function calling tools", () => {
    const result = classifyRequest({
      model: "gpt-4o",
      messages: msgs("what is the weather?"),
      tools: [{ type: "function", function: { name: "get_weather" } }],
    });
    expect(result.requiresFunctionCalling).toBe(true);
  });

  // ── Multi-part content ───────────────────────────────────────────────────────
  it("handles array content (multi-part messages)", () => {
    const result = classifyRequest({
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "text", text: "summarize this document" }] }],
    });
    expect(result.taskType).toBe("summarization");
  });
});
