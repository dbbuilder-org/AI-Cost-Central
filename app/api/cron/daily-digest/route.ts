/**
 * GET /api/cron/daily-digest
 *
 * Daily anomaly + spend digest — runs at 07:00 UTC.
 * Fetches usage from provider admin APIs, runs key-centric anomaly detection,
 * enriches alerts with full context (purpose, docs, code scan), and emails results.
 *
 * Context enrichment pipeline:
 *   1. Fetch key contexts + linked repos from DB
 *   2. Fetch text document excerpts from R2 (runbooks, architecture docs)
 *   3. Run GitHub code scan for linked repos (surgical — call sites only)
 *   4. Pass everything to Claude for code-aware anomaly analysis
 *   5. Cache scan results (12h TTL) to avoid GitHub rate limits
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { fetchAdminUsageRows } from "@/lib/adminUsage";
import { computeDailyData } from "@/lib/briefs/data";
import { sendDailyBrief } from "@/lib/briefs/render-daily";
import { loadBriefConfig } from "@/lib/briefs/config";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import { loadAlertConfig } from "@/lib/alerts/config";
import { scanReposForKey, isScanFresh } from "@/lib/codeScanning";
import { db, schema } from "@/lib/db";
import { inArray } from "drizzle-orm";
import type { Alert } from "@/types/alerts";
import type { KeyContextMap } from "@/lib/alerts/analyzer";
import type { CodeScanSummary } from "@/lib/codeScanning";

export const maxDuration = 180; // extended for code scanning + doc fetching

// ── R2 client ─────────────────────────────────────────────────────────────────

function getR2Client(): S3Client | null {
  if (!process.env.R2_ACCESS_KEY_ID) return null;
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function fetchDocExcerpt(
  r2: S3Client,
  objectKey: string,
  mimeType: string | null
): Promise<string | null> {
  // Only fetch plain text and markdown — PDFs need a parser we don't have yet
  const textTypes = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
  if (!textTypes.has(mimeType ?? "")) return null;

  try {
    const res = await r2.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: objectKey })
    );
    const content = await res.Body?.transformToString();
    return content ? content.slice(0, 1500) : null;
  } catch {
    return null; // non-fatal
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = loadBriefConfig();
  if (config.recipients.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No recipients configured (set BRIEF_RECIPIENTS or ALERT_EMAIL_TO)",
    });
  }

  const startedAt = new Date().toISOString();

  try {
    // ── 1. Fetch usage rows ─────────────────────────────────────────────────
    const rows = await fetchAdminUsageRows(14);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        reason: "No usage data — check OPENAI_ADMIN_KEY and ANTHROPIC_ADMIN_KEY are set",
        startedAt,
      });
    }

    const data = computeDailyData(rows);

    // ── 2. Anomaly detection ────────────────────────────────────────────────
    const alertConfig = await loadAlertConfig(undefined);
    const detections = detectAll(rows, alertConfig);

    let alerts: Alert[] = [];

    if (!config.anomalyEnabled || detections.length === 0) {
      const result = await sendDailyBrief(data, alerts, config);
      return NextResponse.json({
        success: result.sent,
        error: result.error,
        recipients: config.recipients,
        reportDate: data.reportDate,
        totalCostUSD: data.yesterday.totalCostUSD,
        rowCount: rows.length,
        alertCount: 0,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }

    // ── 3. Build key context map (purpose + docs + code scan) ───────────────
    const keyContextMap: KeyContextMap = {};

    try {
      const anomalyKeyIds = [
        ...new Set(detections.map((d) => d.apiKeyId).filter((id): id is string => !!id)),
      ];

      if (anomalyKeyIds.length > 0) {
        const contexts = await db
          .select()
          .from(schema.keyContexts)
          .where(inArray(schema.keyContexts.providerKeyId, anomalyKeyIds));

        const documents = await db
          .select()
          .from(schema.keyDocuments)
          .where(inArray(schema.keyDocuments.providerKeyId, anomalyKeyIds));

        // Fetch text document excerpts from R2
        const r2 = getR2Client();
        const docContentByKey = new Map<string, Array<{ fileName: string; excerpt: string }>>();

        if (r2) {
          for (const doc of documents) {
            const excerpt = await fetchDocExcerpt(r2, doc.blobUrl, doc.mimeType ?? null);
            if (!excerpt) continue;
            const existing = docContentByKey.get(doc.providerKeyId) ?? [];
            existing.push({ fileName: doc.fileName, excerpt });
            docContentByKey.set(doc.providerKeyId, existing);
          }
        }

        // Run code scans (with 12h cache)
        const githubToken = process.env.GITHUB_TOKEN;
        const codeScanByKey = new Map<string, CodeScanSummary>();

        for (const ctx of contexts) {
          const repos = ctx.githubRepos ?? [];
          if (repos.length === 0) continue;

          if (ctx.codeScanAt && isScanFresh(ctx.codeScanAt) && ctx.codeScanJson) {
            codeScanByKey.set(ctx.providerKeyId, ctx.codeScanJson as CodeScanSummary);
            continue;
          }

          try {
            const scan = await scanReposForKey(repos, ctx.provider, githubToken);
            codeScanByKey.set(ctx.providerKeyId, scan);

            // Cache in DB
            await db
              .update(schema.keyContexts)
              .set({
                codeScanJson: scan as unknown as Record<string, unknown>,
                codeScanAt: new Date(),
              })
              .where(inArray(schema.keyContexts.providerKeyId, [ctx.providerKeyId]));
          } catch (scanErr) {
            console.warn(`[cron] Code scan failed for ${ctx.providerKeyId}:`, scanErr);
          }
        }

        // Assemble context map
        for (const ctx of contexts) {
          keyContextMap[ctx.providerKeyId] = {
            purpose: ctx.purpose ?? null,
            displayName: ctx.displayName ?? null,
            provider: ctx.provider,
            docExcerpts: docContentByKey.get(ctx.providerKeyId) ?? [],
            codeScan: codeScanByKey.get(ctx.providerKeyId) ?? null,
          };
        }
      }
    } catch (ctxErr) {
      console.warn("[cron] Context enrichment failed (non-fatal):", ctxErr);
    }

    // ── 4. AI-powered enrichment ─────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    alerts = await enrichWithAI(detections, today, keyContextMap).catch(() =>
      detections.map((d) => ({
        ...d,
        id: `${d.provider}-${d.subject}-${d.type}`,
        detectedAt: today,
        detail: d.message,
        investigateSteps: [],
      }))
    );

    // ── 5. Send digest ──────────────────────────────────────────────────────
    const result = await sendDailyBrief(data, alerts, config);

    return NextResponse.json({
      success: result.sent,
      error: result.error,
      recipients: config.recipients,
      reportDate: data.reportDate,
      totalCostUSD: data.yesterday.totalCostUSD,
      rowCount: rows.length,
      alertCount: alerts.length,
      contextEnriched: Object.keys(keyContextMap).length,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/daily-digest]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
