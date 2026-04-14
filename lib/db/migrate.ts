#!/usr/bin/env tsx
/**
 * One-time migration script: import env-var provider keys into the DB
 * for the first org (single-tenant → SaaS migration).
 *
 * Usage:
 *   DATABASE_URL=... MASTER_ENCRYPTION_KEY=... npx tsx lib/db/migrate.ts
 *
 * What it does:
 *   1. Reads OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY, GOOGLE_SERVICE_ACCOUNT_JSON from env
 *   2. Looks up (or creates) an org by slug "default"
 *   3. Encrypts each key and inserts into api_keys table
 *   4. Skips any key already present (idempotent)
 *
 * Run once per deployment. Safe to run multiple times.
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { eq, and } from "drizzle-orm";
import { generateDEK, encryptDEK, encryptApiKey, keyHint } from "../crypto";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

interface KeyToImport {
  provider: "openai" | "anthropic" | "google";
  displayName: string;
  envVar: string;
  plaintext: string | undefined;
}

async function run() {
  console.log("AICostCentral — env key migration");
  console.log("──────────────────────────────────");

  const keysToImport: KeyToImport[] = [
    { provider: "openai",    displayName: "OpenAI Admin Key (imported)",    envVar: "OPENAI_ADMIN_KEY",            plaintext: process.env.OPENAI_ADMIN_KEY },
    { provider: "anthropic", displayName: "Anthropic Admin Key (imported)", envVar: "ANTHROPIC_ADMIN_KEY",         plaintext: process.env.ANTHROPIC_ADMIN_KEY },
    { provider: "google",    displayName: "Google Service Account (imported)", envVar: "GOOGLE_SERVICE_ACCOUNT_JSON", plaintext: process.env.GOOGLE_SERVICE_ACCOUNT_JSON },
  ].filter((k): k is KeyToImport & { plaintext: string } => !!k.plaintext);

  if (keysToImport.length === 0) {
    console.log("No env-var keys found (OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY, GOOGLE_SERVICE_ACCOUNT_JSON).");
    console.log("Nothing to migrate.");
    return;
  }

  // Get or create "default" org
  let org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, "default"),
  });

  if (!org) {
    console.log("Creating default org…");
    const dek = generateDEK();
    const encryptedDek = encryptDEK(dek);
    const [created] = await db.insert(schema.organizations).values({
      id: `org_default_${Date.now()}`,
      name: "Default Organization",
      slug: "default",
      encryptedDek,
      plan: "free",
      onboarded: true,
    }).returning();
    org = created;
    console.log(`  Created org: ${org.id}`);
  } else {
    console.log(`Found org: ${org.id} (${org.name})`);
  }

  for (const k of keysToImport) {
    // Check if already exists
    const existing = await db.query.apiKeys.findFirst({
      where: and(
        eq(schema.apiKeys.orgId, org.id),
        eq(schema.apiKeys.provider, k.provider),
        eq(schema.apiKeys.isActive, true)
      ),
    });

    if (existing) {
      console.log(`  [skip] ${k.provider} — active key already exists (${existing.displayName})`);
      continue;
    }

    const encryptedValue = encryptApiKey(k.plaintext!, org.encryptedDek);
    const hint = keyHint(k.plaintext!);

    await db.insert(schema.apiKeys).values({
      orgId: org.id,
      provider: k.provider,
      displayName: k.displayName,
      encryptedValue,
      hint,
      description: `Imported from ${k.envVar} environment variable`,
    });

    console.log(`  [ok] ${k.provider} — imported (hint: ···${hint})`);
  }

  console.log("\nMigration complete.");
  console.log("After verifying the keys work in the UI, you can remove the env vars.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
