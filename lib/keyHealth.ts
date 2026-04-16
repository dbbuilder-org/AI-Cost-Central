/**
 * Key health check — validate stored provider API keys by making a
 * minimal API call to each provider.
 *
 * Uses the cheapest/fastest endpoint per provider:
 *   OpenAI    → GET /models (list available models)
 *   Anthropic → POST /messages with max_tokens=1 (1-token response)
 *   Google    → GET models via generativelanguage (list models)
 *   Groq      → GET /models
 *   Mistral   → GET /models
 *   Cohere    → GET /check-api-key
 *
 * Returns { ok: boolean, latencyMs: number, error?: string }
 */

export interface KeyTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

type Provider = "openai" | "anthropic" | "google" | "groq" | "mistral" | "cohere";

async function testOpenAI(key: string): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function testAnthropic(key: string): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "Hi" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 400 (bad request) still means the key is valid — just a bad request
    const ok = res.ok || res.status === 400;
    return { ok, latencyMs: Date.now() - start, error: ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function testGoogle(key: string): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function testGroq(key: string): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function testMistral(key: string): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function testCohere(key: string): Promise<KeyTestResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.cohere.ai/v1/check-api-key", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Network error" };
  }
}

const TESTERS: Record<Provider, (key: string) => Promise<KeyTestResult>> = {
  openai:    testOpenAI,
  anthropic: testAnthropic,
  google:    testGoogle,
  groq:      testGroq,
  mistral:   testMistral,
  cohere:    testCohere,
};

/**
 * Test a single API key for a given provider.
 * Returns { ok, latencyMs, error? }.
 */
export async function testApiKey(provider: string, key: string): Promise<KeyTestResult> {
  const tester = TESTERS[provider as Provider];
  if (!tester) {
    return { ok: false, latencyMs: 0, error: `No tester for provider: ${provider}` };
  }
  return tester(key);
}
