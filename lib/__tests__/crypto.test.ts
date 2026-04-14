import { describe, it, expect, beforeAll } from "vitest";
import {
  generateDEK,
  encryptDEK,
  decryptDEK,
  encryptApiKey,
  decryptApiKey,
  keyHint,
} from "@/lib/crypto";

// Set a valid test master key (32 bytes = 64 hex chars)
const TEST_MASTER_KEY = "a".repeat(64);

beforeAll(() => {
  process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
});

describe("generateDEK", () => {
  it("generates a 64-char hex string (32 bytes)", () => {
    const dek = generateDEK();
    expect(dek).toHaveLength(64);
    expect(dek).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique DEKs on each call", () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    expect(dek1).not.toBe(dek2);
  });
});

describe("DEK encryption/decryption", () => {
  it("round-trips correctly", () => {
    const dek = generateDEK();
    const encrypted = encryptDEK(dek);
    const decrypted = decryptDEK(encrypted);
    expect(decrypted).toBe(dek);
  });

  it("encrypted output has iv:ciphertext:tag format", () => {
    const dek = generateDEK();
    const encrypted = encryptDEK(dek);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12 bytes = 24 hex chars IV
  });

  it("produces different ciphertext each call (unique IVs)", () => {
    const dek = generateDEK();
    const enc1 = encryptDEK(dek);
    const enc2 = encryptDEK(dek);
    expect(enc1).not.toBe(enc2); // Different IV each time
    // But both decrypt to the same value
    expect(decryptDEK(enc1)).toBe(dek);
    expect(decryptDEK(enc2)).toBe(dek);
  });

  it("throws on tampered ciphertext (auth tag failure)", () => {
    const dek = generateDEK();
    const encrypted = encryptDEK(dek);
    const parts = encrypted.split(":");
    // Flip a byte in the ciphertext
    parts[1] = parts[1].slice(0, -2) + (parts[1].endsWith("aa") ? "bb" : "aa");
    const tampered = parts.join(":");
    expect(() => decryptDEK(tampered)).toThrow();
  });
});

describe("API key encryption/decryption", () => {
  it("round-trips an API key correctly", () => {
    const dek = generateDEK();
    const encryptedDek = encryptDEK(dek);
    const apiKey = "sk-admin-abc123def456";

    const encrypted = encryptApiKey(apiKey, encryptedDek);
    const decrypted = decryptApiKey(encrypted, encryptedDek);
    expect(decrypted).toBe(apiKey);
  });

  it("produces different ciphertext for same key (unique IVs)", () => {
    const dek = generateDEK();
    const encryptedDek = encryptDEK(dek);
    const apiKey = "sk-admin-abc123";

    const enc1 = encryptApiKey(apiKey, encryptedDek);
    const enc2 = encryptApiKey(apiKey, encryptedDek);
    expect(enc1).not.toBe(enc2);
    expect(decryptApiKey(enc1, encryptedDek)).toBe(apiKey);
    expect(decryptApiKey(enc2, encryptedDek)).toBe(apiKey);
  });

  it("works with long API keys (Google service account JSON)", () => {
    const dek = generateDEK();
    const encryptedDek = encryptDEK(dek);
    const longKey = JSON.stringify({ type: "service_account", private_key: "x".repeat(1000) });

    const encrypted = encryptApiKey(longKey, encryptedDek);
    const decrypted = decryptApiKey(encrypted, encryptedDek);
    expect(decrypted).toBe(longKey);
  });

  it("throws with wrong DEK", () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    const encDek1 = encryptDEK(dek1);
    const encDek2 = encryptDEK(dek2);
    const apiKey = "sk-secret";

    const encrypted = encryptApiKey(apiKey, encDek1);
    expect(() => decryptApiKey(encrypted, encDek2)).toThrow();
  });
});

describe("keyHint", () => {
  it("returns last 4 chars by default", () => {
    // "sk-admin-abc1234xyz" → last 4 = "4xyz"
    expect(keyHint("sk-admin-abc1234xyz")).toBe("4xyz");
  });

  it("respects custom char count", () => {
    // last 6 of "sk-admin-abc1234xyz" = "234xyz"
    expect(keyHint("sk-admin-abc1234xyz", 6)).toBe("234xyz");
  });
});

describe("MASTER_ENCRYPTION_KEY validation", () => {
  it("throws when key is missing", () => {
    const original = process.env.MASTER_ENCRYPTION_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;
    expect(() => encryptDEK(generateDEK())).toThrow(/MASTER_ENCRYPTION_KEY/);
    process.env.MASTER_ENCRYPTION_KEY = original;
  });

  it("throws when key is wrong length", () => {
    const original = process.env.MASTER_ENCRYPTION_KEY;
    process.env.MASTER_ENCRYPTION_KEY = "tooshort";
    expect(() => encryptDEK(generateDEK())).toThrow(/MASTER_ENCRYPTION_KEY/);
    process.env.MASTER_ENCRYPTION_KEY = original;
  });
});
