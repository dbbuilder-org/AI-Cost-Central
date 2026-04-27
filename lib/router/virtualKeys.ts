/**
 * Virtual key registry for the Anthropic-native SmartRouter proxy.
 *
 * Env var convention (set per project in Doppler/Vercel):
 *   SMARTROUTER_KEY_{SLUG}              — the virtual key value (sk-sr-...)
 *   SMARTROUTER_ANTHROPIC_KEY_{SLUG}    — the real sk-ant-... key to forward with
 *   SMARTROUTER_BUDGET_{SLUG}           — daily budget in USD (optional, e.g. "10")
 *
 * Example for UpApply:
 *   SMARTROUTER_KEY_UPAPPLY=sk-sr-upapply-abc123
 *   SMARTROUTER_ANTHROPIC_KEY_UPAPPLY=sk-ant-...
 *   SMARTROUTER_BUDGET_UPAPPLY=10
 *
 * At resolve time we iterate all env vars once and build a lookup map.
 * The map is module-level so it's built once per cold start.
 */

export interface VirtualKeyContext {
  projectId: string;          // slug in lowercase (e.g. "upapply")
  orgId: string;              // always "smartrouter" for Anthropic-native keys
  realApiKey: string;         // the actual sk-ant-... key
  provider: "anthropic";
  dailyBudgetUsd: number | null;
}

// Build map once per cold start: virtualKey → context
const _registry: Map<string, VirtualKeyContext> = (() => {
  const map = new Map<string, VirtualKeyContext>();

  // Scan for SMARTROUTER_KEY_{SLUG} pattern
  for (const [envKey, envVal] of Object.entries(process.env)) {
    if (!envKey.startsWith("SMARTROUTER_KEY_") || !envVal) continue;
    const slug = envKey.slice("SMARTROUTER_KEY_".length).toLowerCase();

    const realApiKey = process.env[`SMARTROUTER_ANTHROPIC_KEY_${slug.toUpperCase()}`];
    if (!realApiKey) continue; // no real key configured — skip

    const budgetStr = process.env[`SMARTROUTER_BUDGET_${slug.toUpperCase()}`];
    const dailyBudgetUsd = budgetStr ? parseFloat(budgetStr) : null;

    map.set(envVal, {
      projectId: slug,
      orgId: "smartrouter",
      realApiKey,
      provider: "anthropic",
      dailyBudgetUsd: dailyBudgetUsd && !isNaN(dailyBudgetUsd) ? dailyBudgetUsd : null,
    });
  }

  return map;
})();

/**
 * Resolve a virtual key (from x-api-key header) to its context.
 * Returns null if the key is unknown or misconfigured.
 */
export function resolveVirtualKeyForAnthropic(rawKey: string): VirtualKeyContext | null {
  return _registry.get(rawKey) ?? null;
}
