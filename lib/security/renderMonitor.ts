/**
 * Render Service Inventory Monitor
 *
 * Polls the Render API for all services in the workspace, compares against
 * the stored inventory in render_services table, and returns anomalies for
 * any new services from unknown GitHub repos.
 *
 * Attack caught: attacker with stolen Render session deploys their own
 * service (e.g. ws-relay / aiohttp bastion) inside your workspace.
 * Without this monitor, rogue services can run undetected for days.
 */

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

// Render service types we care about monitoring
const SUSPICIOUS_NAME_PATTERNS = [
  /relay/i, /proxy/i, /tunnel/i, /bastion/i, /forward/i,
  /socks/i, /vpn/i, /exfil/i, /c2/i, /backdoor/i,
];

interface RenderApiService {
  id: string;
  name: string;
  type: string;                 // web_service | background_worker | cron_job | static_site
  repo?: {
    owner?: string;
    name?: string;
    branch?: string;
  };
  serviceDetails?: {
    url?: string;
  };
  suspended: string;            // "not_suspended" | "suspended"
  createdAt: string;
  updatedAt: string;
}

export interface RenderServiceAnomaly {
  serviceId: string;
  name: string;
  repoOwner: string | null;
  repoName: string | null;
  url: string | null;
  reason: string;
}

// Known GitHub orgs/owners that belong to us — services from these are trusted
function getKnownRepoOwners(): string[] {
  const envOwners = process.env.KNOWN_GITHUB_OWNERS;
  if (envOwners) return envOwners.split(",").map((s) => s.trim().toLowerCase());
  // Defaults — update via KNOWN_GITHUB_OWNERS env var in Doppler
  return ["dbbuilder-org", "chris-therriault", "shiefuchen"].filter(
    // shiefuchen is NOT ours — left here as example of what NOT to add
    (o) => o !== "shiefuchen"
  );
}

async function fetchRenderServices(): Promise<RenderApiService[]> {
  const apiKey = process.env.RENDER_API_KEY;
  if (!apiKey) {
    console.warn("[renderMonitor] RENDER_API_KEY not set — skipping");
    return [];
  }

  const services: RenderApiService[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL("https://api.render.com/v1/services");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error("[renderMonitor] Render API error:", res.status, await res.text());
      return [];
    }

    const data = await res.json() as { service: RenderApiService; cursor?: string }[];

    for (const item of data) {
      services.push(item.service);
    }

    // Render uses cursor-based pagination; stop when fewer than limit returned
    cursor = data.length === 100 ? data[data.length - 1].cursor : undefined;
  } while (cursor);

  return services;
}

export async function scanRenderServices(): Promise<RenderServiceAnomaly[]> {
  const apiServices = await fetchRenderServices();
  if (apiServices.length === 0) return [];

  const knownOwners = getKnownRepoOwners();
  const anomalies: RenderServiceAnomaly[] = [];
  const now = new Date();

  for (const svc of apiServices) {
    const repoOwner = svc.repo?.owner?.toLowerCase() ?? null;
    const repoName = svc.repo?.name ?? null;
    const url = svc.serviceDetails?.url ?? null;
    const status = svc.suspended === "suspended" ? "suspended" : "active";

    // Upsert into render_services — update lastSeenAt on each scan
    const existing = await db.query.renderServices.findFirst({
      where: eq(schema.renderServices.serviceId, svc.id),
    });

    if (!existing) {
      // New service — analyze before inserting
      let suspiciousReason: string | null = null;

      if (repoOwner && !knownOwners.includes(repoOwner)) {
        suspiciousReason = `Unknown GitHub owner: ${repoOwner}`;
      }

      if (!suspiciousReason) {
        for (const pattern of SUSPICIOUS_NAME_PATTERNS) {
          if (pattern.test(svc.name) || (repoName && pattern.test(repoName))) {
            suspiciousReason = `Suspicious service name matches pattern: ${pattern.source}`;
            break;
          }
        }
      }

      await db.insert(schema.renderServices).values({
        serviceId: svc.id,
        name: svc.name,
        serviceType: svc.type,
        repoOwner,
        repoName,
        branch: svc.repo?.branch ?? null,
        url,
        status,
        isKnown: false,
        suspiciousReason,
        firstSeenAt: now,
        lastSeenAt: now,
      }).onConflictDoNothing();

      if (suspiciousReason) {
        anomalies.push({ serviceId: svc.id, name: svc.name, repoOwner, repoName, url, reason: suspiciousReason });
      }
    } else {
      // Known service — just update lastSeenAt and status
      await db
        .update(schema.renderServices)
        .set({ lastSeenAt: now, status })
        .where(eq(schema.renderServices.serviceId, svc.id));

      // Re-flag previously unsuspected services if repo owner changed (unlikely but possible)
      if (!existing.isKnown && existing.suspiciousReason) {
        anomalies.push({
          serviceId: svc.id,
          name: svc.name,
          repoOwner,
          repoName,
          url,
          reason: existing.suspiciousReason,
        });
      }
    }
  }

  return anomalies;
}
