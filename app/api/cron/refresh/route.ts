import { NextRequest, NextResponse } from "next/server";
import { transformOpenAI, type OAIRawData } from "@/lib/transform";

// Secured cron endpoint — called daily by Vercel Cron at 02:00 UTC
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) return NextResponse.json({ error: "OPENAI_ADMIN_KEY not set" }, { status: 500 });

  const now = Math.floor(Date.now() / 1000);
  const start = now - 28 * 86400;

  try {
    const fetchPage = async (url: string): Promise<unknown[]> => {
      const results: unknown[] = [];
      let after: string | null = null;
      do {
        const fullUrl: string = after ? `${url}&after=${after}` : url;
        const res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${key}` } });
        const data = await res.json();
        results.push(...(data.data ?? []));
        after = data.has_more ? data.last_id ?? null : null;
      } while (after);
      return results;
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

    // Store in Vercel KV if available
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import("@vercel/kv");
      await kv.set("openai:usage:28d", rows, { ex: 86400 }); // 24h TTL
    }

    return NextResponse.json({ success: true, rowCount: rows.length, refreshedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Cron refresh failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
