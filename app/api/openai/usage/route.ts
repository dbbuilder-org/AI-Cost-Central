import { NextRequest, NextResponse } from "next/server";
import { transformOpenAI, type OAIRawData } from "@/lib/transform";

const BASE = "https://api.openai.com/v1/organization";

async function paginate(url: string, token: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let after: string | null = null;
  do {
    const fullUrl = after ? `${url}&after=${after}` : url;
    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    results.push(...(data.data ?? []));
    after = data.has_more ? data.last_id ?? null : null;
  } while (after);
  return results;
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-openai-admin-key") ?? process.env.OPENAI_ADMIN_KEY;
  if (!key) return NextResponse.json({ error: "No API key provided" }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "28");
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;

  try {
    const [completionBuckets, embeddingBuckets, costBuckets, keyList] = await Promise.all([
      paginate(`${BASE}/usage/completions?start_time=${start}&end_time=${now}&limit=100&bucket_width=1d`, key),
      paginate(`${BASE}/usage/embeddings?start_time=${start}&end_time=${now}&limit=100&bucket_width=1d`, key),
      paginate(`${BASE}/costs?start_time=${start}&end_time=${now}&limit=100&bucket_width=1d`, key),
      fetch(`${BASE}/api_keys?limit=100`, { headers: { Authorization: `Bearer ${key}` } })
        .then((r) => r.json())
        .then((d) => d.data ?? []),
    ]);

    const keyNames: Record<string, string> = {};
    for (const k of keyList as { id: string; name: string }[]) {
      keyNames[k.id] = k.name;
    }

    const raw: OAIRawData = {
      completionBuckets: completionBuckets as never,
      embeddingBuckets: embeddingBuckets as never,
      costBuckets: costBuckets as never,
      keyNames,
    };

    const rows = transformOpenAI(raw);
    return NextResponse.json(rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
