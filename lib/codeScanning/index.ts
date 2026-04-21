/**
 * Code scanning orchestrator.
 *
 * Given a list of GitHub repos and the AI provider for a key,
 * searches for AI API call sites, fetches the relevant files,
 * and returns a structured CodeScanSummary ready for the anomaly analyzer.
 *
 * Results are cached in the keyContexts.codeScanJson column for 12 hours
 * to avoid hammering GitHub's API on every daily digest.
 */

import { searchAIUsageFiles, fetchFileContent } from "./github";
import { extractCallSites } from "./extract";
import type { CallSite } from "./extract";

export type { CallSite };

export interface CodeScanSummary {
  repos: string[];
  scannedAt: string;
  totalFilesFound: number;
  totalCallSites: number;
  callSites: CallSite[];
  /** true if any call site has a hardcoded API key string */
  hardcodedKeyFound: boolean;
  /** deduplicated critical risk strings across all call sites */
  criticalRisks: string[];
  /** all unique risk strings (including non-critical) */
  allRisks: string[];
  /** human-readable summary for the AI analyst prompt */
  plainSummary: string;
}

/** Normalise a repo reference to "owner/repo" format */
function normaliseRepo(raw: string): string {
  return raw
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .trim();
}

/** Build a plain-text summary block suitable for inclusion in a Claude prompt */
function buildPlainSummary(callSites: CallSite[], repos: string[]): string {
  if (callSites.length === 0) {
    return `No AI call sites found in linked repos: ${repos.join(", ")}.`;
  }

  const lines: string[] = [
    `Found ${callSites.length} AI call site(s) across ${repos.length} repo(s):`,
  ];

  for (const site of callSites) {
    lines.push("");
    lines.push(`📍 ${site.file} (line ${site.callLine})`);
    lines.push(`   Trigger: ${site.triggerType}`);
    if (site.model) lines.push(`   Model: ${site.model}`);
    if (site.maxTokens !== null) {
      lines.push(`   max_tokens: ${site.maxTokens}`);
    } else {
      lines.push(`   max_tokens: NOT SET`);
    }
    if (site.isStreaming) lines.push(`   Streaming: yes`);
    if (site.inLoop) lines.push(`   ⚠ Inside a loop`);
    if (site.hasUserInput) lines.push(`   ⚠ User input in prompt`);
    if (site.isRecursive) lines.push(`   ⚠ Recursive / agent loop`);
    if (site.hasHardcodedKey) lines.push(`   🚨 Hardcoded key detected`);
    if (site.risks.length > 0) {
      lines.push(`   Risks:`);
      for (const r of site.risks) lines.push(`     - ${r}`);
    }
    lines.push(`   Snippet:`);
    // Indent snippet for readability
    for (const l of site.snippet.split("\n")) lines.push(`     ${l}`);
  }

  return lines.join("\n");
}

/**
 * Scans all linked repos for a key and returns structured findings.
 *
 * @param repos    Array of repo refs ("owner/repo" or full GitHub URL)
 * @param provider AI provider ("openai" | "anthropic" | "google")
 * @param token    Optional GitHub personal access token (private repos / higher rate limit)
 */
export async function scanReposForKey(
  repos: string[],
  provider: string,
  token?: string
): Promise<CodeScanSummary> {
  const normalisedRepos = [...new Set(repos.map(normaliseRepo).filter(Boolean))];
  const allCallSites: CallSite[] = [];
  let totalFilesFound = 0;

  for (const repo of normalisedRepos) {
    // 1. Find files that contain AI call patterns
    const matches = await searchAIUsageFiles(repo, provider, token);
    totalFilesFound += matches.length;

    // 2. Fetch and analyse each matched file
    for (const match of matches) {
      const file = await fetchFileContent(repo, match.path, match.htmlUrl, token);
      if (!file) continue;

      const sites = extractCallSites(file.content, `${repo}/${match.path}`, match.htmlUrl);
      allCallSites.push(...sites);
    }
  }

  const hardcodedKeyFound = allCallSites.some((s) => s.hasHardcodedKey);
  const allRisks = [...new Set(allCallSites.flatMap((s) => s.risks))];
  const criticalRisks = allRisks.filter(
    (r) => r.includes("🚨") || r.includes("injection") || r.includes("unbounded") || r.includes("Recursive")
  );

  const summary: CodeScanSummary = {
    repos: normalisedRepos,
    scannedAt: new Date().toISOString(),
    totalFilesFound,
    totalCallSites: allCallSites.length,
    callSites: allCallSites,
    hardcodedKeyFound,
    criticalRisks,
    allRisks,
    plainSummary: buildPlainSummary(allCallSites, normalisedRepos),
  };

  return summary;
}

/** Returns true if a cached scan is still fresh enough to reuse */
export function isScanFresh(scannedAt: Date | string | null, maxAgeHours = 12): boolean {
  if (!scannedAt) return false;
  const age = Date.now() - new Date(scannedAt).getTime();
  return age < maxAgeHours * 60 * 60 * 1000;
}
