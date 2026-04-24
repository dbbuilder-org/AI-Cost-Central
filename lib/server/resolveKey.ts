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

export type Provider = "openai" | "anthropic" | "google" | "github";

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

  // 2. Env var fallback — works for single-tenant deployments where keys
  //    are set as env vars rather than stored in the DB.
  const envKey = resolveEnvKey(provider);
  if (envKey) return envKey;

  throw new Error(
    `No active API key found for provider "${provider}" in org "${orgId}". ` +
    "Add one in Settings → API Keys."
  );
}

function resolveEnvKey(provider: Provider): string | null {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_ADMIN_KEY ?? process.env.OPENAI_API_KEY ?? null;
    case "anthropic":
      return process.env.ANTHROPIC_ADMIN_KEY ?? process.env.ANTHROPIC_API_KEY ?? null;
    case "google":
      return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
    case "github":
      return process.env.GITHUB_TOKEN ?? null;
    default:
      return null;
  }
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
