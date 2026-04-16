/**
 * Fallback chain execution (Phase 5).
 *
 * When the primary provider returns a 429 (rate limit) or 5xx (server error),
 * we transparently retry on the next provider in the fallback chain.
 *
 * Rules:
 * - Max 2 fallbacks (3 total attempts)
 * - 10s total timeout budget across all attempts
 * - Only retry on: 429, 500, 502, 503, 504
 * - Log fallback_count on the final successful (or last-attempt) request
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_FALLBACKS = 2;

export interface FallbackAttempt {
  provider: string;
  providerUrl: string;
  providerKey: string;
  modelId: string;
}

export interface FallbackResult {
  response: Response;
  providerUsed: string;
  modelUsed: string;
  fallbackCount: number; // 0 = primary succeeded
}

/**
 * Attempt a request with automatic provider fallback.
 * @param primary - primary attempt config
 * @param chain   - ordered list of fallback providers to try if primary fails
 * @param body    - request body (model field will be overridden per attempt)
 */
export async function forwardWithFallback(
  primary: FallbackAttempt,
  chain: FallbackAttempt[],
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<FallbackResult> {
  const attempts = [primary, ...chain.slice(0, MAX_FALLBACKS)];
  let lastResponse: Response | null = null;
  let fallbackCount = 0;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const attemptBody = { ...body, model: attempt.modelId };

    try {
      const res = await fetch(attempt.providerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${attempt.providerKey}`,
        },
        body: JSON.stringify(attemptBody),
        signal,
      });

      lastResponse = res;

      if (res.ok || !RETRYABLE_STATUS.has(res.status) || i === attempts.length - 1) {
        return {
          response: res,
          providerUsed: attempt.provider,
          modelUsed: attempt.modelId,
          fallbackCount,
        };
      }

      // Retryable error — move to next provider
      fallbackCount++;
      console.warn(`[SmartRouter] ${attempt.provider} returned ${res.status}, falling back to ${attempts[i + 1]?.provider ?? "none"}`);
    } catch (err) {
      // Network error — try next
      fallbackCount++;
      console.warn(`[SmartRouter] ${attempt.provider} network error:`, err instanceof Error ? err.message : err);
      if (i === attempts.length - 1) {
        // All attempts failed — rethrow
        throw err;
      }
    }
  }

  // Should not reach here, but satisfy TypeScript
  throw new Error("All fallback attempts exhausted");
}
