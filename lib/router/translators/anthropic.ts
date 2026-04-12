/**
 * Anthropic ↔ OpenAI format translation.
 * Phase 2: used when routing decides to send a request to Anthropic's native API.
 *
 * Anthropic Messages API: POST https://api.anthropic.com/v1/messages
 * Required headers: x-api-key, anthropic-version, content-type
 */

// ── Request translation: OpenAI → Anthropic ──────────────────────────────────

export function toAnthropicRequest(body: Record<string, unknown>): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  const messages = (body.messages as Array<{ role: string; content: unknown }>) ?? [];
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const anthropicBody: Record<string, unknown> = {
    model: body.model,
    messages: nonSystemMessages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    max_tokens: (body.max_tokens as number) ?? (body.max_completion_tokens as number) ?? 4096,
  };

  if (systemMessages.length > 0) {
    const systemText = systemMessages.map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    ).join("\n");
    anthropicBody.system = systemText;
  }

  if (body.temperature !== undefined) anthropicBody.temperature = body.temperature;
  if (body.top_p !== undefined) anthropicBody.top_p = body.top_p;
  if (body.stop !== undefined) anthropicBody.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  if (body.stream) anthropicBody.stream = true;

  // Tool calling translation
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    anthropicBody.tools = (body.tools as Array<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>)
      .filter((t) => t.type === "function")
      .map((t) => ({
        name: t.function.name,
        description: t.function.description ?? "",
        input_schema: t.function.parameters ?? { type: "object", properties: {} },
      }));
  }

  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: anthropicBody,
  };
}

// ── Response translation: Anthropic → OpenAI ─────────────────────────────────

interface AnthropicContent {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContent[];
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export function fromAnthropicResponse(
  anthropic: AnthropicResponse,
  originalModel: string
): Record<string, unknown> {
  const textContent = anthropic.content.find((c) => c.type === "text");
  const toolUseContent = anthropic.content.filter((c) => c.type === "tool_use");

  const message: Record<string, unknown> = {
    role: "assistant",
    content: textContent?.text ?? null,
    refusal: null,
  };

  if (toolUseContent.length > 0) {
    message.tool_calls = toolUseContent.map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.input),
      },
    }));
  }

  const finishReasonMap: Record<string, string> = {
    end_turn: "stop",
    max_tokens: "length",
    tool_use: "tool_calls",
    stop_sequence: "stop",
  };

  return {
    id: `chatcmpl-${anthropic.id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: originalModel,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReasonMap[anthropic.stop_reason ?? "end_turn"] ?? "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: anthropic.usage.input_tokens,
      completion_tokens: anthropic.usage.output_tokens,
      total_tokens: anthropic.usage.input_tokens + anthropic.usage.output_tokens,
    },
  };
}

// ── Streaming: Anthropic SSE → OpenAI SSE ───────────────────────────────────
// Phase 2: implement TransformStream that rewrites Anthropic event chunks to OpenAI delta format.
// Anthropic events: message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
// OpenAI events: role delta (first), content delta chunks, finish_reason chunk, [DONE]
export function createAnthropicStreamTransformer(completionId: string, model: string): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]" || data === "") continue;

        try {
          const event = JSON.parse(data);
          const oaiChunk = translateAnthropicStreamEvent(event, completionId, model);
          if (oaiChunk) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(oaiChunk)}\n\n`));
          }
        } catch {
          // skip malformed events
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  });
}

function translateAnthropicStreamEvent(
  event: Record<string, unknown>,
  completionId: string,
  model: string
): Record<string, unknown> | null {
  const base = {
    id: completionId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  };

  if (event.type === "message_start") {
    return { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] };
  }

  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown>;
    if (delta?.type === "text_delta") {
      return { ...base, choices: [{ index: 0, delta: { content: delta.text }, finish_reason: null }] };
    }
  }

  if (event.type === "message_delta") {
    const delta = event.delta as Record<string, unknown>;
    const stopReasonMap: Record<string, string> = {
      end_turn: "stop", max_tokens: "length", tool_use: "tool_calls",
    };
    return { ...base, choices: [{ index: 0, delta: {}, finish_reason: stopReasonMap[delta?.stop_reason as string] ?? "stop" }] };
  }

  return null;
}
