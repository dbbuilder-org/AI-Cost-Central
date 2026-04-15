import { NextRequest, NextResponse } from "next/server";
import { transformOpenAI, type OAIRawData } from "@/lib/transform";
import { requireAuth } from "@/lib/auth";
import { resolveProviderKey } from "@/lib/server/resolveKey";

const BASE = "https://api.openai.com/v1/organization";

// Usage endpoints use cursor via `next_page` token; costs use `after`
async function paginateUsage(url: string, token: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let nextPage: string | null = null;
  do {
    const fullUrl: string = nextPage ? `${url}&page=${encodeURIComponent(nextPage)}` : url;
    const res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    results.push(...(data.data ?? []));
    nextPage = data.has_more && data.next_page ? data.next_page : null;
  } while (nextPage);
  return results;
}

async function paginateCosts(url: string, token: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let nextPage: string | null = null;
  do {
    const fullUrl: string = nextPage ? `${url}&page=${encodeURIComponent(nextPage)}` : url;
    const res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    results.push(...(data.data ?? []));
    nextPage = data.has_more && data.next_page ? data.next_page : null;
  } while (nextPage);
  return results;
}

async function fetchAllProjectKeys(token: string): Promise<Record<string, string>> {
  // List projects, then fetch keys per project
  const projectsRes = await fetch(`${BASE}/projects?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const projectsData = await projectsRes.json();
  const projects: { id: string; name: string }[] = projectsData.data ?? [];

  const keyNames: Record<string, string> = {};
  await Promise.all(
    projects.map(async (proj) => {
      const res = await fetch(`${BASE}/projects/${proj.id}/api_keys?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      for (const k of (d.data ?? []) as { id: string; name: string }[]) {
        keyNames[k.id] = `${k.name} (${proj.name})`;
      }
    })
  );
  return keyNames;
}

async function resolveOrgId(req: NextRequest): Promise<string> {
  const cronSecret = req.headers.get("x-cron-secret");
  const cronOrgId = req.headers.get("x-org-id");
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET && cronOrgId) {
    return cronOrgId;
  }
  const { orgId } = await requireAuth();
  return orgId;
}

export async function GET(req: NextRequest) {
  let key: string;
  try {
    const orgId = await resolveOrgId(req);
    key = await resolveProviderKey(orgId, "openai");
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err instanceof Error ? err.message : "No OpenAI key configured" }, { status: 404 });
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "28");
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;

  const usageParams = `start_time=${start}&end_time=${now}&limit=31&bucket_width=1d&group_by[]=model&group_by[]=api_key_id`;
  const costParams = `start_time=${start}&end_time=${now}&limit=31&bucket_width=1d`;

  try {
    const [completionBuckets, embeddingBuckets, costBuckets, keyNames] = await Promise.all([
      paginateUsage(`${BASE}/usage/completions?${usageParams}`, key),
      paginateUsage(`${BASE}/usage/embeddings?${usageParams}`, key),
      paginateCosts(`${BASE}/costs?${costParams}`, key),
      fetchAllProjectKeys(key),
    ]);

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
