/**
 * AI provider search patterns for surgical code scanning.
 *
 * Philosophy: we do NOT search for env var names or import statements —
 * those are too broad and match config/CI files. We search for the actual
 * API call sites (SDK method invocations, HTTP fetches to provider endpoints)
 * so every matched file is guaranteed to contain real AI usage.
 *
 * Then within each file we find the *function block* around the call and
 * analyze it for risk signals (loops, no token limit, user input, etc.).
 */

// ── GitHub code search queries ────────────────────────────────────────────────
// These are used as GitHub search API `q=` params.
// Only 2–3 per provider to stay within rate limits.
// Ordered by signal value (most specific first).

export const GITHUB_SEARCH_QUERIES: Record<string, string[]> = {
  openai: [
    "chat.completions.create",         // openai SDK v4 — the primary call site
    "ChatCompletion.create",           // Python old SDK
    "openai.beta.threads",             // Assistants API
  ],
  anthropic: [
    "messages.create",                 // Anthropic SDK — primary call site
    "anthropic.completions.create",    // legacy
  ],
  google: [
    "generateContent(",                // Gemini SDK
    "model.generateContent",
  ],
};

// ── Patterns that identify an actual AI API call line ─────────────────────────
// Used to find the specific line(s) within a file that trigger an AI request.
// Must match the actual invocation, NOT imports or type annotations.

export const AI_CALL_PATTERNS: RegExp[] = [
  // OpenAI TypeScript/JS
  /\.chat\.completions\.create\s*\(/,
  /\.completions\.create\s*\(/,
  /openai\.chat\s*\(/,
  /oai\.chat\.completions/,
  // OpenAI Python
  /ChatCompletion\.create\s*\(/,
  /client\.chat\.completions\.create\s*\(/,
  /openai\.ChatCompletion\.create\s*\(/,
  // Anthropic TypeScript/JS
  /\.messages\.create\s*\(/,
  /anthropic\.messages\s*\./,
  /client\.messages\.create\s*\(/,
  // Anthropic Python
  /client\.messages\.create\s*\(/,
  /anthropic\.Anthropic\(\)\.messages/,
  // Google Gemini
  /\.generateContent\s*\(/,
  /model\.generateContent\s*\(/,
  /genai\.chat\s*\(/,
  // Generic HTTP to AI provider endpoints
  /fetch\s*\(\s*['"`]https:\/\/api\.openai\.com/,
  /fetch\s*\(\s*['"`]https:\/\/api\.anthropic\.com/,
  /axios\.(post|get)\s*\(\s*['"`]https:\/\/api\.openai\.com/,
  /axios\.(post|get)\s*\(\s*['"`]https:\/\/api\.anthropic\.com/,
];

// ── Risk patterns ──────────────────────────────────────────────────────────────

/** Patterns that suggest the AI call is inside a LOOP (cost multiplier) */
export const LOOP_PATTERNS: RegExp[] = [
  /\bfor\s*\(/,
  /\bfor\s+\w+\s+of\b/,
  /\bfor\s+\w+\s+in\b/,
  /\.map\s*\(/,
  /\.forEach\s*\(/,
  /\.flatMap\s*\(/,
  /\.reduce\s*\(/,
  /\bwhile\s*\(/,
  /Promise\.all\s*\(/,
  /Promise\.allSettled\s*\(/,
];

/** Patterns that suggest USER INPUT reaches the prompt without sanitization */
export const USER_INPUT_PATTERNS: RegExp[] = [
  /\breq\.(body|json|query|params)\b/,
  /\brequest\.(body|json|query|params)\b/,
  /await\s+req\.json\s*\(\)/,
  /await\s+request\.json\s*\(\)/,
  /formData\.(get|getAll)\s*\(/,
  /searchParams\.(get|getAll)\s*\(/,
  /ctx\.params\b/,
  /event\.body\b/,
  /event\.queryStringParameters\b/,
];

/** Patterns that suggest a HARDCODED API key is in the source */
export const HARDCODED_KEY_PATTERNS: RegExp[] = [
  /(['"`])sk-[A-Za-z0-9_\-]{20,}\1/,        // OpenAI
  /(['"`])sk-ant-[A-Za-z0-9_\-]{20,}\1/,    // Anthropic
  /(['"`])AIza[A-Za-z0-9_\-]{35}\1/,        // Google
  /apiKey:\s*['"`]sk-/,                      // OpenAI inline config
  /api_key\s*=\s*['"`]sk-/,                 // Python inline
];

/** Patterns that identify WHAT TRIGGERS the AI call */
export const TRIGGER_PATTERNS: Record<string, RegExp> = {
  httpPost:    /export\s+async\s+function\s+POST\b|router\.(post|POST)\s*\(|app\.(post|POST)\s*\(|\bPOST\b.*handler/,
  httpGet:     /export\s+async\s+function\s+GET\b|router\.(get|GET)\s*\(|app\.(get|GET)\s*\(/,
  httpPut:     /export\s+async\s+function\s+PUT\b|router\.(put|PUT)\s*\(/,
  cron:        /@Cron\s*\(|schedule\s*:|cron\.schedule\s*\(|CRON_|setInterval|\.startDaemon/i,
  queue:       /InjectQueue|@Process\s*\(|\.process\s*\(|bullmq|queue\.add|worker\.(on|run)/i,
  webhook:     /webhook|\.stripe\.webhooks\.|clerk\.webhooks|svix\.|Webhook\.verify/i,
  agentLoop:   /while\s*\(\s*(true|iterations|steps|round|!done|running)/i,
  batch:       /\.chunk\s*\(|paginate|cursor|batch|bulkCreate|batchWrite|chunkArray/i,
  script:      /if\s+__name__\s*==|process\.argv|commander\.|yargs\.|cli\./i,
  userFacing:  /\/api\/(chat|complete|generate|ask|answer|query|search|assist)/i,
};

/** Regex to extract model name, max_tokens, temperature from a code block */
export const PARAM_EXTRACT: Record<string, RegExp> = {
  model:       /\bmodel\s*:\s*['"`]([^'"`\n]{3,60})['"`]/,
  maxTokens:   /\bmax_tokens\s*:\s*(\d+)|\bmaxTokens\s*:\s*(\d+)/,
  temperature: /\btemperature\s*:\s*([\d.]+)/,
  streaming:   /\bstream\s*:\s*true\b/,
  topP:        /\btop_p\s*:\s*([\d.]+)/,
};

/** Function-definition patterns — used to find the start of a function block */
export const FUNCTION_START_PATTERNS: RegExp[] = [
  /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+\w+/,
  /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
  /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?function/,
  /^\s*(public|private|protected)\s+(async\s+)?\w+\s*\(/,
  /^\s*(async\s+)?\w+\s*\([^)]*\)\s*\{/,
  /^\s*def\s+\w+\s*\(/,        // Python
  /^\s*async def\s+\w+\s*\(/, // Python async
];
