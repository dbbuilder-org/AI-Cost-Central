/**
 * Server-only: resolve a provider API key for an org.
 *
 * Resolution order:
 *   1. Active key in api_keys table for this org + provider (DB — primary)
 *   2. Environment variable fallback (legacy single-tenant support)
 *
 * IMPORTANT: This file must never be imported in Client Components.
 * The decrypted key must never be returned to the client or logged.
 */

import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { decryptApiKey } from "@/lib/crypto";

export type Provider = "openai" | "anthropic" | "google";

const ENV_FALLBACKS: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_ADMIN_KEY,
  anthropic: process.env.ANTHROPIC_ADMIN_KEY,
  google: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
};

/**
 * Returns the plaintext API key for the given provider within an org.
 * Throws if no key is found in DB or env vars.
 */
export async function resolveProviderKey(
  orgId: string,
  provider: Provider
): Promise<string> {
  // 1. Try DB — find the first active key for this org + provider
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { encryptedDek: true },
  });

  if (org) {
    const key = await db.query.apiKeys.findFirst({
      where: and(
        eq(schema.apiKeys.orgId, orgId),
        eq(schema.apiKeys.provider, provider),
        eq(schema.apiKeys.isActive, true)
      ),
      columns: { encryptedValue: true },
    });

    if (key) {
      return decryptApiKey(key.encryptedValue, org.encryptedDek);
    }
  }

  // 2. Env var fallback (legacy single-tenant / CI)
  const fallback = ENV_FALLBACKS[provider];
  if (fallback) return fallback;

  throw new Error(
    `No active API key found for provider "${provider}" in org "${orgId}". ` +
    "Add one in Settings → API Keys."
  );
}

/**
 * Returns all active keys for a provider within an org (for multi-key scenarios).
 * Decrypts all of them — use sparingly.
 */
export async function resolveAllProviderKeys(
  orgId: string,
  provider: Provider
): Promise<Array<{ id: string; displayName: string; plaintext: string }>> {
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { encryptedDek: true },
  });

  if (!org) return [];

  const keys = await db.query.apiKeys.findMany({
    where: and(
      eq(schema.apiKeys.orgId, orgId),
      eq(schema.apiKeys.provider, provider),
      eq(schema.apiKeys.isActive, true)
    ),
    columns: { id: true, displayName: true, encryptedValue: true },
  });

  return keys.map((k) => ({
    id: k.id,
    displayName: k.displayName,
    plaintext: decryptApiKey(k.encryptedValue, org.encryptedDek),
  }));
}
