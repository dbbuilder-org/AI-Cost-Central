import { NextRequest, NextResponse } from "next/server";
import { transformOpenAI, type OAIRawData } from "@/lib/transform";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { resolveProviderKey } from "@/lib/server/resolveKey";

// Secured cron endpoint — called daily by Vercel Cron at 02:00 UTC
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all orgs with an active OpenAI key
  const activeKeys = await db.query.apiKeys.findMany({
    where: and(
      eq(schema.apiKeys.provider, "openai"),
      eq(schema.apiKeys.isActive, true)
    ),
    columns: { orgId: true },
  });

  const orgIds = [...new Set(activeKeys.map((k) => k.orgId))];
  if (orgIds.length === 0) {
    return NextResponse.json({ success: true, message: "No orgs with active OpenAI keys", refreshedAt: new Date().toISOString() });
  }

  const results: { orgId: string; rowCount?: number; error?: string }[] = [];

  for (const orgId of orgIds) {
    try {
      const key = await resolveProviderKey(orgId, "openai");
      const now = Math.floor(Date.now() / 1000);
      const start = now - 28 * 86400;

      const fetchPage = async (url: string): Promise<unknown[]> => {
        const items: unknown[] = [];
        let after: string | null = null;
        do {
          const fullUrl: string = after ? `${url}&after=${after}` : url;
          const res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${key}` } });
          const data = await res.json();
          items.push(...(data.data ?? []));
          after = data.has_more ? data.last_id ?? null : null;
        } while (after);
        return items;
      };

      const base = "https://api.openai.com/v1/organization";
      const [completionBuckets, embeddingBuckets, costBuckets, keyRes] = await Promise.all([
        fetchPage(`${base}/usage/completions?start_time=${start}&end_time=${now}&limit=100&bucket_width=1d`),
        fetchPage(`${base}/usage/embeddings?start_time=${start}&end_time=${now}&limit=100&bucket_width=1d`),
        fetchPage(`${base}/costs?start_time=${start}&end_time=${now}&limit=100&bucket_width=1d`),
        fetch(`${base}/api_keys?limit=100`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()),
      ]);

      const keyNames: Record<string, string> = {};
      for (const k of (keyRes.data ?? []) as { id: string; name: string }[]) {
        keyNames[k.id] = k.name;
      }

      const raw: OAIRawData = {
        completionBuckets: completionBuckets as never,
        embeddingBuckets: embeddingBuckets as never,
        costBuckets: costBuckets as never,
        keyNames,
      };

      const rows = transformOpenAI(raw);

      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        const { kv } = await import("@vercel/kv");
        await kv.set(`openai:usage:28d:${orgId}`, rows, { ex: 86400 });
      }

      results.push({ orgId, rowCount: rows.length });
    } catch (e: unknown) {
      results.push({ orgId, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return NextResponse.json({ success: true, results, refreshedAt: new Date().toISOString() });
}
