/**
 * AES-256-GCM envelope encryption for provider API keys.
 *
 * Architecture:
 *   MASTER_ENCRYPTION_KEY (env var, 32 bytes hex)
 *     └── encrypts → per-org DEK (stored in organizations.encrypted_dek)
 *                        └── encrypts → API key values (stored in api_keys.encrypted_value)
 *
 * Format: `${ivHex}:${ciphertextHex}:${authTagHex}`
 *
 * NEVER reuse an IV. Every call to encrypt* generates a fresh crypto.randomBytes(12).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;   // 96-bit IV — correct for GCM
const TAG_BYTES = 16;  // 128-bit auth tag

function getKEK(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${tag.toString("hex")}`;
}

function decrypt(encoded: string, key: Buffer): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload format");
  const [ivHex, ciphertextHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── DEK management ────────────────────────────────────────────────────────────

/** Generate a new 256-bit Data Encryption Key (hex string). */
export function generateDEK(): string {
  return randomBytes(32).toString("hex");
}

/** Encrypt a DEK with the master KEK for storage in the organizations table. */
export function encryptDEK(dek: string): string {
  return encrypt(dek, getKEK());
}

/** Decrypt a DEK from the organizations table. */
export function decryptDEK(encryptedDek: string): string {
  return decrypt(encryptedDek, getKEK());
}

// ── API Key encryption ────────────────────────────────────────────────────────

/** Encrypt a provider API key value using the org's DEK. */
export function encryptApiKey(plaintext: string, encryptedDek: string): string {
  const dek = decryptDEK(encryptedDek);
  return encrypt(plaintext, Buffer.from(dek, "hex"));
}

/** Decrypt a provider API key value using the org's DEK. */
export function decryptApiKey(encryptedValue: string, encryptedDek: string): string {
  const dek = decryptDEK(encryptedDek);
  return decrypt(encryptedValue, Buffer.from(dek, "hex"));
}

/** Extract the last N chars of a key for the hint field (never store more). */
export function keyHint(plaintext: string, chars = 4): string {
  return plaintext.slice(-chars);
}
