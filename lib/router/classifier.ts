/**
 * Task classifier — determines what kind of task an LLM request is performing.
 * Pure heuristics, no LLM call, sub-millisecond.
 */
import type { TaskType, ClassificationResult } from "@/types/router";

interface Message {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>;
}

function extractText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content.map((c) => c.text ?? "").join(" ");
}

function allText(messages: Message[]): string {
  return messages.map((m) => extractText(m.content as string)).join(" ").toLowerCase();
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 chars
  return Math.ceil(text.length / 4);
}

export function classifyRequest(params: {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  tools?: unknown[];
}): ClassificationResult {
  const { model, messages, temperature = 1, max_tokens, response_format, tools } = params;
  const text = allText(messages);
  const signals: string[] = [];

  let taskType: TaskType = "chat";
  let confidence = 50;

  const requiresVision = messages.some((m) =>
    Array.isArray(m.content) && m.content.some((c) => c.type === "image_url")
  );
  const requiresJsonMode = response_format?.type === "json_object";
  const requiresFunctionCalling = (tools?.length ?? 0) > 0;

  if (requiresVision) {
    taskType = "vision";
    confidence = 95;
    signals.push("image_url in messages");
  } else if (model.includes("embedding") || model.includes("ada")) {
    taskType = "embedding";
    confidence = 99;
    signals.push("embedding model requested");
  } else if (
    ["o1", "o3", "o4-mini", "o1-mini", "o1-preview", "o3-mini"].some((m) => model.includes(m)) ||
    /step[- ]by[- ]step|think.*carefully|reason.*through|chain.*thought/i.test(text)
  ) {
    taskType = "reasoning";
    confidence = 85;
    signals.push("reasoning model or reasoning keywords");
  } else if (requiresJsonMode && temperature < 0.4) {
    // Low temp + JSON mode → extraction
    const extractKeywords = /extract|parse|identify|find all|list all|return.*field|pull out/i.test(text);
    if (extractKeywords) {
      taskType = "extraction";
      confidence = 90;
      signals.push("json_mode + low temperature + extraction keywords");
    } else {
      taskType = "classification";
      confidence = 75;
      signals.push("json_mode + low temperature → likely classification/extraction");
    }
  } else if (
    /classify|categorize|label|which category|select.*from|choose.*from|yes or no|true or false|score \d/i.test(text) ||
    (max_tokens !== undefined && max_tokens < 50)
  ) {
    taskType = "classification";
    confidence = 82;
    signals.push("classification keywords or very low max_tokens");
  } else if (
    /summarize|summarise|tldr|key points|brief.*summary|condense|shorten/i.test(text)
  ) {
    taskType = "summarization";
    confidence = 85;
    signals.push("summarization keywords");
  } else if (
    /```|function |class |def |import |const |let |var |return |async |await |SELECT |INSERT |UPDATE |CREATE TABLE/i.test(text) ||
    /write.*code|fix.*bug|implement.*function|debug|refactor|explain.*code/i.test(text)
  ) {
    taskType = "coding";
    confidence = 85;
    signals.push("code blocks or coding task keywords");
  } else if (
    temperature > 0.7 ||
    /write.*essay|write.*email|write.*letter|write.*blog|draft.*|compose.*|create.*content|generate.*copy/i.test(text)
  ) {
    taskType = "generation";
    confidence = 75;
    signals.push("high temperature or generation keywords");
  }

  const fullText = messages.map((m) => extractText(m.content as string)).join(" ");
  const estimatedInputTokens = estimateTokens(fullText);
  const estimatedOutputTokens = max_tokens ?? (taskType === "classification" ? 20 : taskType === "extraction" ? 200 : 500);

  return {
    taskType,
    confidence,
    signals,
    estimatedInputTokens,
    estimatedOutputTokens,
    requiresVision,
    requiresJsonMode,
    requiresFunctionCalling,
  };
}
