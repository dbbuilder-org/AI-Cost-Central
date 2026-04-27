/**
 * Inbound access policy enforcement for the SmartRouter.
 *
 * Checks each incoming request against per-project restrictions stored in
 * ProjectRoutingConfig. All checks are optional — an absent or empty list
 * means "unrestricted" for that dimension.
 *
 * Dimensions:
 *  - allowedIps:     IPv4/IPv6 CIDR allowlist (checked against x-forwarded-for)
 *  - allowedOrigins: origin/referrer prefix allowlist (CORS-style)
 *  - allowedModels:  exact model ID allowlist (checked before routing runs)
 */

import type { ProjectRoutingConfig } from "@/lib/db/schema";

// ── IPv4 CIDR matching ────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr ?? "32", 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

// ── IPv6 CIDR matching (prefix-only, no subnet math needed for common cases) ──

function ipv6Normalize(ip: string): string {
  // Expand :: shorthand — sufficient for prefix comparison
  if (!ip.includes("::")) return ip;
  const halves = ip.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  return [...left, ...Array(missing).fill("0"), ...right].join(":");
}

function ipv6InCidr(ip: string, cidr: string): boolean {
  const [base, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr ?? "128", 10);
  const ipGroups  = ipv6Normalize(ip).split(":");
  const baseGroups = ipv6Normalize(base).split(":");
  let bitsLeft = prefix;
  for (let i = 0; i < 8 && bitsLeft > 0; i++) {
    const bits = Math.min(bitsLeft, 16);
    const mask = ~((1 << (16 - bits)) - 1) & 0xffff;
    if ((parseInt(ipGroups[i], 16) & mask) !== (parseInt(baseGroups[i], 16) & mask)) {
      return false;
    }
    bitsLeft -= bits;
  }
  return true;
}

function ipInCidr(ip: string, cidr: string): boolean {
  try {
    if (cidr.includes(":")) return ipv6InCidr(ip, cidr);
    return ipv4InCidr(ip, cidr);
  } catch {
    return false;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface PolicyViolation {
  dimension: "ip" | "origin" | "model";
  message: string;
}

export interface PolicyContext {
  /** Raw value of x-forwarded-for (or x-real-ip) header */
  clientIp: string | null;
  /** Raw value of Origin header (preferred) or Referer header */
  origin: string | null;
  /** Model ID the caller requested (pre-normalization) */
  modelRequested: string;
  /** Project routing config loaded from DB */
  config: ProjectRoutingConfig;
}

/**
 * Returns a PolicyViolation if the request should be rejected, or null if all
 * checks pass. Checks run in order: IP → origin → model (cheapest first).
 */
export function checkAccessPolicy(ctx: PolicyContext): PolicyViolation | null {
  const { clientIp, origin, modelRequested, config } = ctx;

  // ── IP allowlist ─────────────────────────────────────────────────────────
  if (config.allowedIps && config.allowedIps.length > 0) {
    const ip = clientIp?.split(",")[0].trim() ?? "";
    if (!ip) {
      return { dimension: "ip", message: "Request origin IP could not be determined" };
    }
    const allowed = config.allowedIps.some((cidr) => ipInCidr(ip, cidr));
    if (!allowed) {
      return { dimension: "ip", message: `IP ${ip} is not in this project's allowlist` };
    }
  }

  // ── Origin / referrer allowlist ──────────────────────────────────────────
  if (config.allowedOrigins && config.allowedOrigins.length > 0) {
    if (!origin) {
      return { dimension: "origin", message: "Request missing Origin or Referer header" };
    }
    const allowed = config.allowedOrigins.some((o) => origin.startsWith(o));
    if (!allowed) {
      return { dimension: "origin", message: `Origin "${origin}" is not in this project's allowlist` };
    }
  }

  // ── Model allowlist ──────────────────────────────────────────────────────
  if (config.allowedModels && config.allowedModels.length > 0) {
    if (!config.allowedModels.includes(modelRequested)) {
      return {
        dimension: "model",
        message: `Model "${modelRequested}" is not permitted for this project. Allowed: ${config.allowedModels.join(", ")}`,
      };
    }
  }

  return null;
}
