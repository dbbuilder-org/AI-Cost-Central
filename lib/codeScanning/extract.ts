/**
 * Surgical code extraction and risk analysis.
 *
 * For each file that contains an AI API call:
 *   1. Find the exact line(s) with the call
 *   2. Extract the enclosing function block (not the whole file)
 *   3. Detect trigger type (what invokes this function?)
 *   4. Detect risk patterns within the function block
 *   5. Extract a focused snippet (15 lines) for the AI analyst
 *
 * This keeps Claude's context surgical — it sees HOW and WHY the AI is called,
 * not a wall of unrelated code.
 */

import {
  AI_CALL_PATTERNS,
  LOOP_PATTERNS,
  USER_INPUT_PATTERNS,
  HARDCODED_KEY_PATTERNS,
  TRIGGER_PATTERNS,
  PARAM_EXTRACT,
  FUNCTION_START_PATTERNS,
} from "./patterns";

export interface CallSite {
  /** file path (repo:path) */
  file: string;
  /** line number in original file */
  callLine: number;
  /** what invokes this function */
  triggerType: string;
  /** AI model used, if detectable */
  model: string | null;
  /** max_tokens setting, null if not set */
  maxTokens: number | null;
  /** temperature setting, null if not set */
  temperature: number | null;
  /** stream: true in the call */
  isStreaming: boolean;
  /** AI call is inside a for/while/map loop */
  inLoop: boolean;
  /** user request data (req.body, formData, etc.) flows into the prompt */
  hasUserInput: boolean;
  /** hardcoded API key string detected */
  hasHardcodedKey: boolean;
  /** function appears to call itself (recursive agent) */
  isRecursive: boolean;
  /** structured risk descriptions */
  risks: string[];
  /** focused 15-line snippet centered on the AI call, with arrow marker */
  snippet: string;
  /** GitHub URL to the file */
  githubUrl?: string;
}

// ── Function block extraction ─────────────────────────────────────────────────

/**
 * Searches backward from callLineIndex to find the nearest function definition.
 * Returns the start line index (0-based) of that definition.
 */
function findFunctionStart(lines: string[], callLineIndex: number): number {
  const searchStart = Math.max(0, callLineIndex - 80);
  for (let i = callLineIndex - 1; i >= searchStart; i--) {
    if (FUNCTION_START_PATTERNS.some((p) => p.test(lines[i]))) {
      return Math.max(0, i - 1); // include one line before for decorators/comments
    }
  }
  return Math.max(0, callLineIndex - 30); // fallback: 30 lines above
}

/**
 * Finds the closing brace of a function block by tracking brace depth.
 * Returns the end line index (0-based).
 */
function findFunctionEnd(lines: string[], startIndex: number, callLineIndex: number): number {
  let depth = 0;
  let entered = false;

  for (let i = startIndex; i < Math.min(lines.length, callLineIndex + 80); i++) {
    for (const ch of lines[i]) {
      if (ch === "{") { depth++; entered = true; }
      if (ch === "}") {
        depth--;
        if (entered && depth <= 0) {
          return Math.min(lines.length - 1, i + 1);
        }
      }
    }
  }
  return Math.min(lines.length - 1, callLineIndex + 40);
}

// ── Trigger detection ─────────────────────────────────────────────────────────

/**
 * Determines what triggers the AI call by looking at the file's top section
 * and the function's surrounding code.
 */
function detectTrigger(content: string, callLineIndex: number): string {
  const lines = content.split("\n");
  // Look at file header (top 30 lines) + context before the call (30 lines up)
  const head = lines.slice(0, 30).join("\n");
  const before = lines.slice(Math.max(0, callLineIndex - 40), callLineIndex + 1).join("\n");
  const context = head + "\n" + before;

  const labelMap: Record<string, string> = {
    httpPost:   "HTTP POST endpoint (user-facing)",
    httpGet:    "HTTP GET endpoint",
    httpPut:    "HTTP PUT endpoint",
    cron:       "Scheduled cron job",
    queue:      "Queue / background worker",
    webhook:    "Webhook handler",
    agentLoop:  "AI agent loop",
    batch:      "Batch processor",
    script:     "CLI / script",
    userFacing: "User-facing API route",
  };

  for (const [key, pattern] of Object.entries(TRIGGER_PATTERNS)) {
    if (pattern.test(context)) return labelMap[key] ?? key;
  }
  return "Unknown trigger";
}

// ── Parameter extraction ──────────────────────────────────────────────────────

function extractParams(block: string): {
  model: string | null;
  maxTokens: number | null;
  temperature: number | null;
  isStreaming: boolean;
} {
  const modelMatch = PARAM_EXTRACT.model.exec(block);
  const maxTokensMatch = PARAM_EXTRACT.maxTokens.exec(block);
  const tempMatch = PARAM_EXTRACT.temperature.exec(block);
  const isStreaming = PARAM_EXTRACT.streaming.test(block);

  return {
    model: modelMatch?.[1] ?? null,
    maxTokens: maxTokensMatch ? parseInt(maxTokensMatch[1] ?? maxTokensMatch[2]) : null,
    temperature: tempMatch ? parseFloat(tempMatch[1]) : null,
    isStreaming,
  };
}

// ── Risk analysis ─────────────────────────────────────────────────────────────

function analyzeRisks(
  block: string,
  functionName: string | null,
  inLoop: boolean,
  hasUserInput: boolean,
  maxTokens: number | null,
  isStreaming: boolean,
  hasHardcodedKey: boolean,
): string[] {
  const risks: string[] = [];

  if (hasHardcodedKey) {
    risks.push("🚨 Hardcoded API key detected — immediate secret leakage risk");
  }

  if (maxTokens === null && !isStreaming) {
    risks.push("No max_tokens set — response length is unbounded, cost is unpredictable");
  }

  if (inLoop) {
    // Check if it's a parallelized loop (more dangerous)
    if (/Promise\.all\s*\(/.test(block) && /\.map\s*\(/.test(block)) {
      risks.push(
        "Parallel AI calls via Promise.all(.map()) — N simultaneous requests; cost = N × per-call cost with no backpressure"
      );
    } else {
      risks.push("AI call inside a loop — total cost scales linearly with input size");
    }
  }

  if (hasUserInput && maxTokens === null) {
    risks.push(
      "User-controlled input in prompt with no token cap — prompt injection and runaway cost risk"
    );
  } else if (hasUserInput) {
    risks.push("User-controlled input flows into prompt — verify injection protection");
  }

  if (isStreaming && maxTokens === null) {
    risks.push(
      "Streaming response with no max_tokens — connection held open until model stops naturally"
    );
  }

  // Check for recursive call (function name appears in its own body)
  if (functionName && block.includes(functionName + "(")) {
    const selfCallCount = (block.match(new RegExp(functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(", "g")) ?? []).length;
    if (selfCallCount > 1) {
      // > 1 because the function definition itself counts as 1
      risks.push(
        `Possible recursive agent — function "${functionName}" appears to call itself; verify termination condition`
      );
    }
  }

  // Check for missing error handling around AI call
  if (!/try\s*\{/.test(block) && !/\.catch\s*\(/.test(block)) {
    risks.push("No error handling around AI call — exceptions will propagate uncaught");
  }

  return risks;
}

// ── Snippet builder ───────────────────────────────────────────────────────────

function buildSnippet(lines: string[], callLineIndex: number): string {
  const before = 5;
  const after = 10;
  const start = Math.max(0, callLineIndex - before);
  const end = Math.min(lines.length - 1, callLineIndex + after);

  return lines
    .slice(start, end + 1)
    .map((line, idx) => {
      const lineNo = start + idx + 1;
      const marker = start + idx === callLineIndex ? "→ " : "  ";
      return `${String(lineNo).padStart(4)} ${marker}${line}`;
    })
    .join("\n")
    .slice(0, 1200); // hard cap to keep token use reasonable
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Returns all AI call sites found in a file, with risk analysis for each.
 * Each returned CallSite represents one distinct function that calls an AI API.
 */
export function extractCallSites(
  content: string,
  filePath: string,
  githubUrl?: string
): CallSite[] {
  const lines = content.split("\n");
  const results: CallSite[] = [];
  const processedRanges = new Set<string>(); // avoid emitting same function block twice

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!AI_CALL_PATTERNS.some((p) => p.test(line))) continue;

    // Extract the function block around this call
    const fnStart = findFunctionStart(lines, i);
    const fnEnd = findFunctionEnd(lines, fnStart, i);
    const rangeKey = `${fnStart}:${fnEnd}`;

    if (processedRanges.has(rangeKey)) continue;
    processedRanges.add(rangeKey);

    const block = lines.slice(fnStart, fnEnd + 1).join("\n");

    // Extract function name for recursion detection
    let functionName: string | null = null;
    for (let fi = fnStart; fi < Math.min(fnStart + 5, lines.length); fi++) {
      const fnNameMatch = /(?:function|const|def)\s+(\w+)/.exec(lines[fi]);
      if (fnNameMatch) { functionName = fnNameMatch[1]; break; }
    }

    const inLoop = LOOP_PATTERNS.some((p) => p.test(block));
    const hasUserInput = USER_INPUT_PATTERNS.some((p) => p.test(block));
    const hasHardcodedKey = HARDCODED_KEY_PATTERNS.some((p) => p.test(block));
    const { model, maxTokens, temperature, isStreaming } = extractParams(block);
    const triggerType = detectTrigger(content, i);
    const risks = analyzeRisks(
      block, functionName, inLoop, hasUserInput,
      maxTokens, isStreaming, hasHardcodedKey
    );
    const isRecursive =
      !!functionName &&
      (block.match(new RegExp(functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(", "g")) ?? []).length > 1;

    results.push({
      file: filePath,
      callLine: i + 1,
      triggerType,
      model,
      maxTokens,
      temperature,
      isStreaming,
      inLoop,
      hasUserInput,
      hasHardcodedKey,
      isRecursive,
      risks,
      snippet: buildSnippet(lines, i),
      githubUrl,
    });
  }

  return results;
}
