/**
 * GitHub code search and file content retrieval.
 *
 * Uses GitHub's Search API to find files containing AI API call patterns,
 * then fetches raw file content for analysis.
 *
 * Rate limits (unauthenticated): 10 searches/min
 * Rate limits (authenticated):   30 searches/min, 5000 req/hour
 *
 * We always pass GITHUB_TOKEN if available, and add inter-request delays
 * to avoid hitting limits regardless.
 */

import { GITHUB_SEARCH_QUERIES } from "./patterns";

export interface GitHubMatch {
  repo: string;
  path: string;
  htmlUrl: string;
  score: number;
}

export interface FetchedFile {
  repo: string;
  path: string;
  content: string;
  htmlUrl: string;
}

function buildHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AICostCentral-Scanner/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Returns deduplicated, scored file matches for AI call patterns in a repo. */
export async function searchAIUsageFiles(
  repo: string,
  provider: string,
  token?: string
): Promise<GitHubMatch[]> {
  const queries = GITHUB_SEARCH_QUERIES[provider] ?? GITHUB_SEARCH_QUERIES.openai;
  const headers = buildHeaders(token);

  const seen = new Set<string>();
  const results: GitHubMatch[] = [];

  // Use first 2 queries only — precise enough, stays within rate limits
  for (const query of queries.slice(0, 2)) {
    try {
      const url =
        `https://api.github.com/search/code` +
        `?q=${encodeURIComponent(query)}+repo:${encodeURIComponent(repo)}` +
        `&per_page=10`;

      const res = await fetch(url, { headers });

      if (res.status === 403 || res.status === 429) {
        // Rate limited — stop searching this repo
        console.warn(`[codeScanning] GitHub rate limited for repo ${repo}`);
        break;
      }
      if (!res.ok) continue; // 404 (private/nonexistent), 422 (invalid query), etc.

      const data = (await res.json()) as {
        items?: Array<{ path: string; html_url: string; score: number }>;
      };

      for (const item of data.items ?? []) {
        if (seen.has(item.path)) continue;
        seen.add(item.path);
        results.push({
          repo,
          path: item.path,
          htmlUrl: item.html_url,
          score: item.score,
        });
      }
    } catch {
      // Network error — skip this query
    }

    // Respect rate limit with a small delay between searches
    await new Promise((r) => setTimeout(r, token ? 300 : 700));
  }

  // Filter out test files, migrations, lock files — they're noise
  const filtered = results.filter((f) => {
    const p = f.path.toLowerCase();
    return (
      !p.includes("__tests__") &&
      !p.includes(".test.") &&
      !p.includes(".spec.") &&
      !p.includes("node_modules") &&
      !p.includes("package-lock") &&
      !p.endsWith(".lock") &&
      !p.endsWith(".snap") &&
      !p.includes("migrations/")
    );
  });

  // Rank: prefer src/, app/, lib/, pages/, routes/ — those are the real logic
  return filtered
    .sort((a, b) => {
      const rank = (p: string) => {
        if (/^(src|app|lib|pages|routes|api|server)\//.test(p)) return 10;
        if (/^(utils|helpers|services|workers)\//.test(p)) return 5;
        return 0;
      };
      return b.score + rank(b.path) - (a.score + rank(a.path));
    })
    .slice(0, 5); // cap at 5 files per repo to control analysis cost
}

/** Fetches raw file content from GitHub. Returns null on failure. */
export async function fetchFileContent(
  repo: string,
  path: string,
  htmlUrl: string,
  token?: string
): Promise<FetchedFile | null> {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/HEAD/${path}`;

  try {
    const headers = buildHeaders(token);
    // raw.githubusercontent.com serves raw content directly — no API quota used
    const res = await fetch(rawUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;

    const content = await res.text();

    // Skip files that are too large to be focused AI logic
    if (content.length > 80_000) return null;

    return { repo, path, content, htmlUrl };
  } catch {
    return null;
  }
}
