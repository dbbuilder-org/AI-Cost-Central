#!/usr/bin/env node
/**
 * rotate-master-key.ts
 *
 * Re-encrypts all organizations.encrypted_dek values from OLD_MASTER_KEY → NEW_MASTER_KEY.
 * The API keys themselves (api_keys.encrypted_value) are encrypted with the DEK, not the
 * master key, so they don't need to change — only the DEK wrapper does.
 *
 * Usage:
 *   OLD_MASTER_KEY=<64-char-hex> \
 *   NEW_MASTER_KEY=<64-char-hex> \
 *   DATABASE_URL=<neon-connection-string> \
 *   npx tsx scripts/rotate-master-key.ts
 *
 * Safety:
 *   - Dry-run by default. Pass --apply to write changes.
 *   - Idempotent: if interrupted, re-run. Successfully rotated orgs are skipped
 *     because the new key will decrypt them; orgs still on the old key will fail
 *     to decrypt with the new key, so they get re-processed automatically.
 *   - Verifies every DEK round-trips correctly before writing anything.
 *   - Prints a summary before exiting.
 *
 * After this script succeeds (--apply):
 *   1. Set MASTER_ENCRYPTION_KEY=<NEW_MASTER_KEY> in Vercel (Sensitive type)
 *   2. Redeploy AICostCentral
 *   3. Verify the app can decrypt org DEKs by loading the dashboard
 *   4. Delete all records of the old key
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// ── Args ────────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--apply");
const OLD_HEX = process.env.OLD_MASTER_KEY ?? "";
const NEW_HEX = process.env.NEW_MASTER_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

function assertEnv() {
  const errors: string[] = [];
  if (!OLD_HEX || OLD_HEX.length !== 64)
    errors.push("OLD_MASTER_KEY must be a 64-char hex string");
  if (!NEW_HEX || NEW_HEX.length !== 64)
    errors.push("NEW_MASTER_KEY must be a 64-char hex string");
  if (!DATABASE_URL)
    errors.push("DATABASE_URL is required");
  if (OLD_HEX === NEW_HEX)
    errors.push("OLD_MASTER_KEY and NEW_MASTER_KEY must be different");
  if (errors.length) {
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
}

// ── Raw AES-256-GCM (mirrors lib/crypto.ts exactly) ─────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function encryptWith(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${tag.toString("hex")}`;
}

function decryptWith(encoded: string, keyHex: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error(`Invalid format (got ${parts.length} parts)`);
  const [ivHex, ciphertextHex, tagHex] = parts;
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  encrypted_dek: string;
}

async function main() {
  console.log("\n=== AICostCentral Master Key Rotation ===");
  console.log(DRY_RUN
    ? "Mode: DRY RUN (pass --apply to write changes)"
    : "Mode: APPLY — writing changes to database");
  console.log(`Old key: ${OLD_HEX.slice(0, 8)}…${OLD_HEX.slice(-8)}`);
  console.log(`New key: ${NEW_HEX.slice(0, 8)}…${NEW_HEX.slice(-8)}`);
  console.log("");

  assertEnv();

  const sql = neon(DATABASE_URL);

  // Fetch all orgs
  const rows = await sql`
    SELECT id, name, encrypted_dek
    FROM organizations
    ORDER BY created_at ASC
  ` as OrgRow[];

  console.log(`Found ${rows.length} organization(s)\n`);

  let skipped = 0;
  let rotated = 0;
  let failed = 0;

  for (const org of rows) {
    process.stdout.write(`  org ${org.id} (${org.name ?? "unnamed"}): `);

    // Step 1: try to decrypt with the NEW key first — if it succeeds, this org
    // was already rotated (e.g., from a previous interrupted run). Skip it.
    let dekPlaintext: string;
    let alreadyRotated = false;

    try {
      dekPlaintext = decryptWith(org.encrypted_dek, NEW_HEX);
      alreadyRotated = true;
    } catch {
      // Expected — org hasn't been rotated yet. Now try old key.
      try {
        dekPlaintext = decryptWith(org.encrypted_dek, OLD_HEX);
      } catch (e) {
        console.log(`FAILED (cannot decrypt with either key — skipping)`);
        console.error(`    Error: ${e instanceof Error ? e.message : e}`);
        failed++;
        continue;
      }
    }

    if (alreadyRotated) {
      console.log("already rotated — skipped");
      skipped++;
      continue;
    }

    // Step 2: verify the DEK itself is a 64-char hex string (sanity check)
    if (dekPlaintext.length !== 64 || !/^[0-9a-f]+$/i.test(dekPlaintext)) {
      console.log("FAILED (decrypted DEK has unexpected format)");
      console.error(`    DEK: ${dekPlaintext.slice(0, 16)}… (${dekPlaintext.length} chars)`);
      failed++;
      continue;
    }

    // Step 3: re-encrypt with new key
    const newEncryptedDek = encryptWith(dekPlaintext, NEW_HEX);

    // Step 4: verify the re-encryption round-trips before writing
    let roundTripped: string;
    try {
      roundTripped = decryptWith(newEncryptedDek, NEW_HEX);
    } catch (e) {
      console.log("FAILED (re-encrypted DEK does not round-trip)");
      console.error(`    Error: ${e instanceof Error ? e.message : e}`);
      failed++;
      continue;
    }

    if (roundTripped !== dekPlaintext) {
      console.log("FAILED (round-trip mismatch — not writing)");
      failed++;
      continue;
    }

    // Step 5: write to DB (unless dry run)
    if (!DRY_RUN) {
      try {
        await sql`
          UPDATE organizations
          SET encrypted_dek = ${newEncryptedDek},
              updated_at    = NOW()
          WHERE id = ${org.id}
        `;
      } catch (e) {
        console.log("FAILED (DB write error)");
        console.error(`    Error: ${e instanceof Error ? e.message : e}`);
        failed++;
        continue;
      }
    }

    console.log(DRY_RUN ? "OK (dry run — not written)" : "OK");
    rotated++;
  }

  // Summary
  console.log("\n─── Summary ───────────────────────────────────────");
  if (DRY_RUN) {
    console.log(`  Would rotate: ${rotated}`);
  } else {
    console.log(`  Rotated:      ${rotated}`);
  }
  console.log(`  Already done: ${skipped}`);
  console.log(`  Failed:       ${failed}`);
  console.log("───────────────────────────────────────────────────");

  if (failed > 0) {
    console.error("\n⚠️  Some orgs could not be rotated. Investigate the errors above.");
    process.exit(1);
  }

  if (DRY_RUN && rotated > 0) {
    console.log("\nDry run complete. Re-run with --apply to write changes.");
  } else if (!DRY_RUN && rotated > 0) {
    console.log(`
✓ Rotation complete.

Next steps:
  1. Update MASTER_ENCRYPTION_KEY in Vercel (must be Sensitive type):
       vercel env rm MASTER_ENCRYPTION_KEY production
       vercel env add MASTER_ENCRYPTION_KEY production
       # paste: ${NEW_HEX}
       # select: Sensitive

  2. Redeploy:
       vercel --prod

  3. Verify the dashboard loads and API keys are accessible.

  4. Securely delete the old key — do NOT store it anywhere.
`);
  } else if (!DRY_RUN && rotated === 0 && skipped === rows.length) {
    console.log("\n✓ All orgs were already rotated. Nothing to do.");
  }
}

main().catch((e) => {
  console.error("\nFatal error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
