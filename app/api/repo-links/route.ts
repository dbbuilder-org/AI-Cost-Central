import { NextRequest, NextResponse } from "next/server";

// Vercel KV for persisting repo links
// Falls back to in-memory if KV not configured (local dev)
let memStore: Record<string, RepoLink[]> = {};

export interface RepoLink {
  id: string;
  apiKeyId: string;       // maps to OpenAI project API key ID
  apiKeyName: string;
  githubOwner: string;
  githubRepo: string;
  pathFilter: string;     // e.g. "api/app/services"
  displayName: string;
  createdAt: string;
}

async function kvGet(key: string): Promise<unknown> {
  if (process.env.KV_REST_API_URL) {
    const { kv } = await import("@vercel/kv");
    return kv.get(key);
  }
  return memStore[key] ?? null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (process.env.KV_REST_API_URL) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, value);
  } else {
    memStore[key] = value as RepoLink[];
  }
}

const STORE_KEY = "aicc:repo-links";

async function getLinks(): Promise<RepoLink[]> {
  return ((await kvGet(STORE_KEY)) as RepoLink[]) ?? [];
}

// GET — list all repo links
export async function GET() {
  const links = await getLinks();
  return NextResponse.json(links);
}

// POST — add a repo link
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKeyId, apiKeyName, githubOwner, githubRepo, pathFilter, displayName } = body;

  if (!apiKeyId || !githubOwner || !githubRepo) {
    return NextResponse.json({ error: "apiKeyId, githubOwner, githubRepo required" }, { status: 400 });
  }

  const links = await getLinks();
  const newLink: RepoLink = {
    id: crypto.randomUUID(),
    apiKeyId,
    apiKeyName: apiKeyName ?? apiKeyId,
    githubOwner,
    githubRepo,
    pathFilter: pathFilter ?? "",
    displayName: displayName ?? `${githubOwner}/${githubRepo}`,
    createdAt: new Date().toISOString(),
  };

  const updated = [...links.filter((l) => l.apiKeyId !== apiKeyId), newLink];
  await kvSet(STORE_KEY, updated);
  return NextResponse.json(newLink, { status: 201 });
}

// DELETE — remove a repo link
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const links = await getLinks();
  await kvSet(STORE_KEY, links.filter((l) => l.id !== id));
  return NextResponse.json({ ok: true });
}
