import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveProviderKey } from "@/lib/server/resolveKey";

const GITHUB_API = "https://api.github.com";

// Models to search for in code
const MODEL_PATTERNS = [
  "gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-3.5", "gpt-4o-mini", "gpt-4.1-nano", "gpt-4.1-mini",
  "o1-mini", "o1-preview", "o3-mini", "o3", "o4-mini",
  "claude-3", "claude-haiku", "claude-sonnet", "claude-opus",
  "gemini-2", "gemini-1.5", "gemini-flash", "gemini-pro",
  "llama-3", "mistral-large", "mistral-small", "ministral",
  "text-embedding-3", "text-embedding-ada",
];

interface CodeHit {
  file: string;
  line: number;
  snippet: string;
  model: string;
}

interface ScanResult {
  repo: string;
  scannedAt: string;
  hits: CodeHit[];
  totalFiles: number;
  error?: string;
}

async function ghFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `GitHub API error ${res.status}`);
  }
  return res.json();
}

async function getFileContent(owner: string, repo: string, path: string, token: string): Promise<string> {
  try {
    const data = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, token);
    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content ?? "";
  } catch {
    return "";
  }
}

function findModelHits(content: string, filePath: string): Omit<CodeHit, "file">[] {
  const hits: Omit<CodeHit, "file">[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of MODEL_PATTERNS) {
      if (line.toLowerCase().includes(pattern.toLowerCase())) {
        // Get ±3 lines context
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length - 1, i + 3);
        const snippet = lines.slice(start, end + 1)
          .map((l, idx) => `${start + idx + 1}: ${l}`)
          .join("\n");
        hits.push({ line: i + 1, snippet, model: pattern });
        break; // one hit per line
      }
    }
  }
  return hits;
}

export async function POST(req: NextRequest) {
  const { owner, repo, pathFilter } = await req.json();

  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo required" }, { status: 400 });
  }

  // Accept pre-resolved token from internal server-to-server calls (e.g. /api/analyze)
  const internalToken = req.headers.get("x-internal-github-token");
  let token: string;
  if (internalToken) {
    token = internalToken;
  } else {
    try {
      const { orgId } = await requireAuth();
      token = await resolveProviderKey(orgId, "github");
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: err instanceof Error ? err.message : "No GitHub token configured" }, { status: 404 });
    }
  }

  try {
    // Use GitHub Search Code API to find files mentioning AI model names
    const modelQuery = MODEL_PATTERNS.slice(0, 8).join("|"); // GitHub search supports OR via spaces
    const pathQ = pathFilter ? `+path:${encodeURIComponent(pathFilter)}` : "";
    const q = `(gpt-4o OR gpt-4.1 OR claude OR gemini OR llama) repo:${owner}/${repo}${pathQ ? ` path:${pathFilter}` : ""}`;

    const searchData = await ghFetch(
      `${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=30`,
      token
    );

    const files: Array<{ path: string }> = searchData.items ?? [];
    const allHits: CodeHit[] = [];

    // Fetch content of each matching file (cap at 15 files to avoid rate limits)
    await Promise.all(
      files.slice(0, 15).map(async (f) => {
        const content = await getFileContent(owner, repo, f.path, token);
        if (!content) return;
        const hits = findModelHits(content, f.path);
        for (const h of hits) {
          allHits.push({ file: f.path, ...h });
        }
      })
    );

    const result: ScanResult = {
      repo: `${owner}/${repo}`,
      scannedAt: new Date().toISOString(),
      hits: allHits.sort((a, b) => a.file.localeCompare(b.file)),
      totalFiles: files.length,
    };

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
