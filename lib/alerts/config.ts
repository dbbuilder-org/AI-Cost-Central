/**
 * Alert threshold configuration loader.
 *
 * Currently returns DEFAULT_CONFIG for all callers.
 * Designed for per-tenant overrides: when the DB is populated, pass a tenantId
 * to get org-specific thresholds stored in the alert_configs table.
 *
 * Future DB schema (alert_configs):
 *   orgId          text PK
 *   spikeZScore    numeric
 *   spikeMinPct    numeric
 *   dropMaxPct     numeric
 *   minBaselineCost numeric   -- $/day avg below which a key is ignored
 *   minAlertDelta  numeric    -- minimum dollar change to fire any alert
 *   newKeyDays     integer
 *   minBaselineDays integer
 *   modelShiftMin  numeric
 *   updatedAt      timestamptz
 *
 * Usage today:
 *   const config = await loadAlertConfig();          // global defaults
 *
 * Usage once per-tenant is wired:
 *   const config = await loadAlertConfig(org.id);    // org overrides merged with defaults
 */

import type { AlertConfig } from "@/types/alerts";
import { DEFAULT_CONFIG } from "@/types/alerts";

export interface TenantAlertConfig extends AlertConfig {
  tenantId?: string;   // undefined = global defaults
  updatedAt?: string;  // ISO timestamp of last override edit
}

/**
 * Load alert config for a tenant.
 * Falls back to DEFAULT_CONFIG if no override exists or DB is unavailable.
 */
export async function loadAlertConfig(tenantId?: string): Promise<TenantAlertConfig> {
  if (!tenantId) {
    return { ...DEFAULT_CONFIG };
  }

  // TODO: replace stub with DB lookup once alert_configs table is migrated
  // Example:
  //   const row = await db.query.alertConfigs.findFirst({
  //     where: eq(alertConfigs.orgId, tenantId),
  //   });
  //   if (row) return { ...DEFAULT_CONFIG, ...row, tenantId };

  return { ...DEFAULT_CONFIG, tenantId };
}

/**
 * Synchronous variant for contexts where async isn't available (e.g. pure detectors).
 * Always returns defaults — use loadAlertConfig() when tenant context is available.
 */
export function getDefaultAlertConfig(): TenantAlertConfig {
  return { ...DEFAULT_CONFIG };
}
