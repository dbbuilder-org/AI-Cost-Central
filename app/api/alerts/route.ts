/**
 * GET /api/alerts
 *
 * Runs anomaly detection across all providers and returns enriched alerts.
 * Results are cached in Vercel KV for 1 hour when available.
 * Can be force-refreshed with ?refresh=1
 */

import { NextRequest, NextResponse } from "next/server";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import { fetchAllUsageRows } from "@/lib/alerts/fetchAllRows";
import type { Alert } from "@/types/alerts";

const KV_KEY = "alerts:latest";
const CACHE_TTL_SECONDS = 3600; // 1 hour

async function getKV() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  const { kv } = await import("@vercel/kv");
  return kv;
}

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  const kv = await getKV();

  // Try cache first
  if (!refresh && kv) {
    try {
      const cached = await kv.get<Alert[]>(KV_KEY);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { "X-Cache": "HIT" },
        });
      }
    } catch {
      // KV unavailable, fall through to computation
    }
  }

  try {
    const rows = await fetchAllUsageRows();
    if (rows.length === 0) {
      return NextResponse.json([], { headers: { "X-Cache": "MISS" } });
    }

    const detections = detectAll(rows);
    const today = new Date().toISOString().slice(0, 10);
    const alerts = await enrichWithAI(detections, today);

    // Cache result
    if (kv) {
      try {
        await kv.set(KV_KEY, alerts, { ex: CACHE_TTL_SECONDS });
      } catch {
        // KV write failed — non-fatal
      }
    }

    return NextResponse.json(alerts, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Detection failed";
    console.error("[api/alerts]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
