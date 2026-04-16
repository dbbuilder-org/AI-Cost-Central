/**
 * Provider key pool with round-robin load balancing.
 *
 * When an org has multiple active API keys for the same provider,
 * the SmartRouter distributes requests across them to avoid rate limits.
 *
 * Strategy: atomic counter per (orgId, provider) pair, incremented on
 * each selection. Keys are selected via index = counter % keyCount.
 *
 * In-process cache: keys are re-fetched at most every KEY_CACHE_TTL_MS
 * to avoid a DB round-trip on every request. The counter is never reset
 * (monotonically increasing) so rotation stays even across cache refreshes.
 *
 * Graceful degradation:
 *  - If the DB is unavailable, falls back to the env-var key (OPENAI_API_KEY etc.)
 *  - If no keys found for a provider, returns null (caller falls back to env var)
 */

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto";

const KEY_CACHE_TTL_MS = 60_000; // 1 minute

interface PoolEntry {
  keys: string[];           // plaintext API keys
  fetchedAt: number;        // Date.now() when fetched
}

// In-process cache: "orgId:provider" → PoolEntry
const keyCache = new Map<string, PoolEntry>();
// Round-robin counter: "orgId:provider" → number
const rrCounter = new Map<string, number>();

const PROVIDER_KEY_ENV: Record<string, string> = {
  openai:    "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google:    "GOOGLE_AI_API_KEY",
  groq:      "GROQ_API_KEY",
  mistral:   "MISTRAL_API_KEY",
  cohere:    "COHERE_API_KEY",
};

/** Resolve the env-var fallback key for a provider (may be undefined). */
function envFallback(provider: string): string | null {
  const envName = PROVIDER_KEY_ENV[provider];
  return envName ? (process.env[envName] ?? null) : null;
}

/** Fetch and decrypt all active keys for orgId+provider from the DB. */
async function fetchKeysFromDB(orgId: string, provider: string): Promise<string[]> {
  // Passthrough orgs have no DB keys — they use the raw auth header
  if (orgId === "passthrough" || orgId === "default") return [];

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { encryptedDek: true },
  });
  if (!org?.encryptedDek) return [];

  const rows = await db.query.apiKeys.findMany({
    where: and(
      eq(schema.apiKeys.orgId, orgId),
      eq(schema.apiKeys.provider, provider),
      eq(schema.apiKeys.isActive, true),
    ),
    columns: { encryptedValue: true },
  });

  const keys: string[] = [];
  for (const row of rows) {
    try {
      const plaintext = decryptApiKey(row.encryptedValue, org.encryptedDek);
      if (plaintext) keys.push(plaintext);
    } catch {
      // Skip keys that fail to decrypt (e.g. DEK rotation in progress)
    }
  }
  return keys;
}

/**
 * Select the next provider API key for the given org + provider using
 * round-robin balancing across all active keys.
 *
 * Returns null if no keys are found (caller should handle gracefully).
 */
export async function pickKey(orgId: string, provider: string): Promise<string | null> {
  const cacheKey = `${orgId}:${provider}`;
  const now = Date.now();

  // Check cache freshness
  let entry = keyCache.get(cacheKey);
  if (!entry || now - entry.fetchedAt > KEY_CACHE_TTL_MS) {
    try {
      const keys = await fetchKeysFromDB(orgId, provider);
      entry = { keys, fetchedAt: now };
      keyCache.set(cacheKey, entry);
    } catch {
      // DB unavailable — fall through to env-var fallback
      return envFallback(provider);
    }
  }

  // No DB keys — fall back to env var
  if (!entry.keys.length) return envFallback(provider);

  // Single key — no rotation needed
  if (entry.keys.length === 1) return entry.keys[0];

  // Round-robin
  const counter = (rrCounter.get(cacheKey) ?? 0) + 1;
  rrCounter.set(cacheKey, counter);
  return entry.keys[counter % entry.keys.length];
}

/**
 * Return all plaintext keys for orgId+provider (used for building fallback chains).
 * Same caching logic as pickKey().
 */
export async function listKeys(orgId: string, provider: string): Promise<string[]> {
  const cacheKey = `${orgId}:${provider}`;
  const now = Date.now();

  let entry = keyCache.get(cacheKey);
  if (!entry || now - entry.fetchedAt > KEY_CACHE_TTL_MS) {
    try {
      const keys = await fetchKeysFromDB(orgId, provider);
      entry = { keys, fetchedAt: now };
      keyCache.set(cacheKey, entry);
    } catch {
      const envKey = envFallback(provider);
      return envKey ? [envKey] : [];
    }
  }

  if (entry.keys.length) return entry.keys;
  const envKey = envFallback(provider);
  return envKey ? [envKey] : [];
}

/** For testing: clear the in-process caches. */
export function clearKeyCache(): void {
  keyCache.clear();
  rrCounter.clear();
}
