import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// virtualKeys builds its registry at module load time from process.env.
// We use vi.resetModules() + dynamic import to test with fresh env vars.

describe("resolveVirtualKeyForAnthropic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null for an unknown key when no SMARTROUTER_KEY_* env vars are set", async () => {
    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    expect(resolveVirtualKeyForAnthropic("sk-sr-nonexistent")).toBeNull();
  });

  it("returns null for an empty string key", async () => {
    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    expect(resolveVirtualKeyForAnthropic("")).toBeNull();
  });

  it("resolves a virtual key with budget when env vars are set", async () => {
    vi.stubEnv("SMARTROUTER_KEY_TESTAPP", "sk-sr-testapp-abc123");
    vi.stubEnv("SMARTROUTER_ANTHROPIC_KEY_TESTAPP", "sk-ant-test-realkey");
    vi.stubEnv("SMARTROUTER_BUDGET_TESTAPP", "25");

    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    const ctx = resolveVirtualKeyForAnthropic("sk-sr-testapp-abc123");

    expect(ctx).not.toBeNull();
    expect(ctx!.projectId).toBe("testapp");
    expect(ctx!.orgId).toBe("smartrouter");
    expect(ctx!.realApiKey).toBe("sk-ant-test-realkey");
    expect(ctx!.provider).toBe("anthropic");
    expect(ctx!.dailyBudgetUsd).toBe(25);
  });

  it("resolves a virtual key with null budget when SMARTROUTER_BUDGET_* is absent", async () => {
    vi.stubEnv("SMARTROUTER_KEY_NOBUD", "sk-sr-nobud-xyz");
    vi.stubEnv("SMARTROUTER_ANTHROPIC_KEY_NOBUD", "sk-ant-real-nobud");

    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    const ctx = resolveVirtualKeyForAnthropic("sk-sr-nobud-xyz");

    expect(ctx).not.toBeNull();
    expect(ctx!.dailyBudgetUsd).toBeNull();
  });

  it("skips a SMARTROUTER_KEY_* entry that has no matching ANTHROPIC key", async () => {
    vi.stubEnv("SMARTROUTER_KEY_ORPHAN", "sk-sr-orphan-zzz");
    // Deliberately omit SMARTROUTER_ANTHROPIC_KEY_ORPHAN

    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    expect(resolveVirtualKeyForAnthropic("sk-sr-orphan-zzz")).toBeNull();
  });

  it("handles slug case-insensitivity (slug is lowercased, env key lookup is uppercased)", async () => {
    // SLUG in env key is UPPER, stored projectId should be lower
    vi.stubEnv("SMARTROUTER_KEY_MYSLUG", "sk-sr-myslug-111");
    vi.stubEnv("SMARTROUTER_ANTHROPIC_KEY_MYSLUG", "sk-ant-myslug-real");

    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    const ctx = resolveVirtualKeyForAnthropic("sk-sr-myslug-111");

    expect(ctx!.projectId).toBe("myslug");
  });

  it("ignores an invalid (NaN) budget string", async () => {
    vi.stubEnv("SMARTROUTER_KEY_NANTEST", "sk-sr-nantest-000");
    vi.stubEnv("SMARTROUTER_ANTHROPIC_KEY_NANTEST", "sk-ant-nantest-real");
    vi.stubEnv("SMARTROUTER_BUDGET_NANTEST", "not-a-number");

    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");
    const ctx = resolveVirtualKeyForAnthropic("sk-sr-nantest-000");

    expect(ctx!.dailyBudgetUsd).toBeNull();
  });

  it("registers multiple virtual keys independently", async () => {
    vi.stubEnv("SMARTROUTER_KEY_APP1", "sk-sr-app1-aaa");
    vi.stubEnv("SMARTROUTER_ANTHROPIC_KEY_APP1", "sk-ant-app1-real");
    vi.stubEnv("SMARTROUTER_KEY_APP2", "sk-sr-app2-bbb");
    vi.stubEnv("SMARTROUTER_ANTHROPIC_KEY_APP2", "sk-ant-app2-real");

    const { resolveVirtualKeyForAnthropic } = await import("@/lib/router/virtualKeys");

    const ctx1 = resolveVirtualKeyForAnthropic("sk-sr-app1-aaa");
    const ctx2 = resolveVirtualKeyForAnthropic("sk-sr-app2-bbb");

    expect(ctx1!.projectId).toBe("app1");
    expect(ctx2!.projectId).toBe("app2");
    expect(ctx1!.realApiKey).toBe("sk-ant-app1-real");
    expect(ctx2!.realApiKey).toBe("sk-ant-app2-real");
  });
});
