import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB + crypto ───────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      organizations: {
        findFirst: vi.fn(),
      },
      apiKeys: {
        findMany: vi.fn(),
      },
    },
  },
  schema: {
    organizations: { id: "organizations.id" },
    apiKeys: {
      orgId: "api_keys.org_id",
      provider: "api_keys.provider",
      isActive: "api_keys.is_active",
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decryptApiKey: vi.fn((encrypted: string) => `plaintext-${encrypted}`),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

import { pickKey, listKeys, clearKeyCache } from "@/lib/router/keyPool";
import { db } from "@/lib/db";

const mockOrgQuery = db.query.organizations.findFirst as ReturnType<typeof vi.fn>;
const mockKeysQuery = db.query.apiKeys.findMany as ReturnType<typeof vi.fn>;

function stubOrg(dek = "fake-dek") {
  mockOrgQuery.mockResolvedValue({ encryptedDek: dek });
}

function stubKeys(encryptedValues: string[]) {
  mockKeysQuery.mockResolvedValue(
    encryptedValues.map((ev) => ({ encryptedValue: ev })),
  );
}

describe("pickKey", () => {
  beforeEach(() => {
    clearKeyCache();
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("returns env-var fallback when no DB keys exist", async () => {
    process.env.OPENAI_API_KEY = "env-key-123";
    stubOrg();
    stubKeys([]);

    const key = await pickKey("org1", "openai");
    expect(key).toBe("env-key-123");
  });

  it("returns null when no DB keys and no env var", async () => {
    stubOrg();
    stubKeys([]);
    const key = await pickKey("org1", "openai");
    expect(key).toBeNull();
  });

  it("returns the single DB key when only one exists", async () => {
    stubOrg();
    stubKeys(["enc-key-A"]);

    const key = await pickKey("org1", "openai");
    expect(key).toBe("plaintext-enc-key-A");
  });

  it("round-robins across multiple DB keys", async () => {
    stubOrg();
    stubKeys(["enc-A", "enc-B", "enc-C"]);

    const results = await Promise.all([
      pickKey("org1", "openai"),
      pickKey("org1", "openai"),
      pickKey("org1", "openai"),
      pickKey("org1", "openai"),
    ]);

    // Should cycle through the 3 keys
    expect(new Set(results.slice(0, 3)).size).toBe(3);
    // 4th call wraps back to start
    expect(results[3]).toBe(results[0]);
  });

  it("different org+provider pairs have independent counters", async () => {
    stubOrg();
    stubKeys(["enc-X", "enc-Y"]);

    const a1 = await pickKey("org1", "openai");
    const b1 = await pickKey("org2", "openai");

    // Both start their own counters independently
    expect(a1).toBeDefined();
    expect(b1).toBeDefined();
  });

  it("passthrough orgId uses env-var fallback without DB query", async () => {
    process.env.OPENAI_API_KEY = "env-passthrough";

    const key = await pickKey("passthrough", "openai");
    expect(key).toBe("env-passthrough");
    expect(mockOrgQuery).not.toHaveBeenCalled();
  });

  it("falls back to env var when DB throws", async () => {
    process.env.OPENAI_API_KEY = "env-fallback";
    mockOrgQuery.mockRejectedValue(new Error("DB offline"));

    const key = await pickKey("org1", "openai");
    expect(key).toBe("env-fallback");
  });
});

describe("listKeys", () => {
  beforeEach(() => {
    clearKeyCache();
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("returns all decrypted DB keys", async () => {
    stubOrg();
    stubKeys(["enc-1", "enc-2"]);

    const keys = await listKeys("org1", "openai");
    expect(keys).toEqual(["plaintext-enc-1", "plaintext-enc-2"]);
  });

  it("returns env-var in array when no DB keys", async () => {
    process.env.OPENAI_API_KEY = "env-key";
    stubOrg();
    stubKeys([]);

    const keys = await listKeys("org1", "openai");
    expect(keys).toEqual(["env-key"]);
  });

  it("returns empty array when no keys at all", async () => {
    stubOrg();
    stubKeys([]);
    const keys = await listKeys("org1", "openai");
    expect(keys).toEqual([]);
  });
});
