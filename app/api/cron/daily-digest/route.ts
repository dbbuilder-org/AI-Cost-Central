/**
 * GET /api/cron/daily-digest
 *
 * Daily anomaly + spend digest — runs at 07:00 UTC.
 *
 * Idempotency: if today's alerts already exist in key_alerts, the expensive
 * steps (GitHub code scan, Claude AI enrichment) are skipped entirely and
 * the cached results are used. Safe to trigger multiple times per day.
 *
 * Pipeline (first run of the day only):
 *   1. Fetch 14d usage rows from provider admin APIs
 *   2. Detect anomalies (stateless, cheap)
 *   3. Fetch key contexts + R2 doc excerpts for anomalous keys
 *   4. Run GitHub code scan (72h cache in key_contexts.code_scan_json)
 *   5. AI enrichment via Claude (key context + code findings → explanation)
 *   6. Persist enriched alerts to key_alerts (deduplicated by key+type+date)
 *   7. Send digest email
 *
 * Subsequent same-day runs:
 *   1. Fetch usage rows (needed for spend data in email body)
 *   2. Load today's alerts from key_alerts
 *   3. Send digest email (no API calls to GitHub or Claude)
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { eq, inArray, and } from "drizzle-orm";
import { fetchAdminUsageRows } from "@/lib/adminUsage";
import { computeDailyData } from "@/lib/briefs/data";
import { sendDailyBrief } from "@/lib/briefs/render-daily";
import { loadBriefConfig } from "@/lib/briefs/config";
import { detectAll } from "@/lib/alerts/detector";
import { enrichWithAI } from "@/lib/alerts/analyzer";
import { loadAlertConfig } from "@/lib/alerts/config";
import { scanReposForKey, isScanFresh } from "@/lib/codeScanning";
import { db, schema } from "@/lib/db";
import type { Alert } from "@/types/alerts";
import type { KeyContextMap } from "@/lib/alerts/analyzer";
import type { CodeScanSummary } from "@/lib/codeScanning";

export const maxDuration = 180;

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
  const textTypes = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
  if (!textTypes.has(mimeType ?? "")) return null;
  try {
    const res = await r2.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: objectKey })
    );
    const content = await res.Body?.transformToString();
    return content ? content.slice(0, 1500) : null;
  } catch {
    return null;
  }
}

// ── Persist alerts to DB ──────────────────────────────────────────────────────

async function persistAlerts(alerts: Alert[], todayStr: string): Promise<void> {
  for (const alert of alerts) {
    try {
      await db
        .insert(schema.keyAlerts)
        .values({
          providerKeyId: alert.apiKeyId ?? alert.subject,
          provider: alert.provider,
          alertType: alert.type,
          severity: alert.severity,
          subject: alert.subject,
          message: alert.message,
          detail: alert.detail ?? "",
          investigateSteps: (alert.investigateSteps ?? []) as unknown as Record<string, unknown>,
          value: String(alert.value ?? 0),
          baseline: String(alert.baseline ?? 0),
          changePct: String(alert.changePct ?? 0),
          models: alert.models ?? [],
          detectedAt: todayStr,
          aiEnriched: true,
        })
        .onConflictDoUpdate({
          // Upgrade fallback alerts inserted by the hourly anomaly-check
          target: [schema.keyAlerts.providerKeyId, schema.keyAlerts.alertType, schema.keyAlerts.detectedAt],
          set: {
            detail: alert.detail ?? "",
            investigateSteps: (alert.investigateSteps ?? []) as unknown as Record<string, unknown>,
            severity: alert.severity,
            message: alert.message,
            aiEnriched: true,
          },
        });
    } catch (err) {
      console.warn("[cron] Failed to persist alert:", alert.id, err);
    }
  }
}

// ── Load cached alerts from DB ────────────────────────────────────────────────

async function loadCachedAlerts(todayStr: string): Promise<Alert[] | null> {
  try {
    const rows = await db
      .select()
      .from(schema.keyAlerts)
      .where(eq(schema.keyAlerts.detectedAt, todayStr));

    // Return null (force re-analysis) if any alerts are un-enriched fallbacks
    // from the hourly anomaly-check cron. The daily digest will AI-enrich them.
    if (rows.length === 0 || rows.some((r) => !r.aiEnriched)) return null;

    return rows.map((row) => ({
      id: row.id,
      type: row.alertType as Alert["type"],
      severity: row.severity as Alert["severity"],
      provider: row.provider,
      subject: row.subject,
      message: row.message,
      detail: row.detail,
      investigateSteps: (row.investigateSteps as string[]) ?? [],
      value: Number(row.value ?? 0),
      baseline: Number(row.baseline ?? 0),
      changePct: Number(row.changePct ?? 0),
      models: row.models ?? [],
      apiKeyId: row.providerKeyId,
      detectedAt: row.detectedAt,
    }));
  } catch {
    return null; // DB unavailable — proceed normally
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
  const today = new Date().toISOString().slice(0, 10);

  try {
    // ── 1. Fetch usage rows (always needed for email body) ──────────────────
    const rows = await fetchAdminUsageRows(14);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        reason: "No usage data — check OPENAI_ADMIN_KEY and ANTHROPIC_ADMIN_KEY are set",
        startedAt,
      });
    }

    const data = computeDailyData(rows);

    // ── 2. Check DB cache — skip analysis if already ran today ──────────────
    const cachedAlerts = config.anomalyEnabled ? await loadCachedAlerts(today) : null;

    if (cachedAlerts !== null) {
      // Already ran today — send email with cached alerts, no GitHub/Claude calls
      const result = await sendDailyBrief(data, cachedAlerts, config);
      return NextResponse.json({
        success: result.sent,
        error: result.error,
        recipients: config.recipients,
        reportDate: data.reportDate,
        totalCostUSD: data.yesterday.totalCostUSD,
        rowCount: rows.length,
        alertCount: cachedAlerts.length,
        cached: true,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }

    // ── 3. Anomaly detection ────────────────────────────────────────────────
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

    // ── 4. Build context map (purpose + R2 docs + code scan) ────────────────
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

        // Code scans — 72h cache in DB
        const githubToken = process.env.GITHUB_TOKEN;
        const codeScanByKey = new Map<string, CodeScanSummary>();

        for (const ctx of contexts) {
          const repos = ctx.githubRepos ?? [];
          if (repos.length === 0) continue;

          if (ctx.codeScanAt && isScanFresh(ctx.codeScanAt) && ctx.codeScanJson) {
            // Use cached scan
            codeScanByKey.set(ctx.providerKeyId, ctx.codeScanJson as CodeScanSummary);
            continue;
          }

          try {
            const scan = await scanReposForKey(repos, ctx.provider, githubToken);
            codeScanByKey.set(ctx.providerKeyId, scan);
            await db
              .update(schema.keyContexts)
              .set({
                codeScanJson: scan as unknown as Record<string, unknown>,
                codeScanAt: new Date(),
              })
              .where(and(
                inArray(schema.keyContexts.providerKeyId, [ctx.providerKeyId])
              ));
          } catch (scanErr) {
            console.warn(`[cron] Code scan failed for ${ctx.providerKeyId}:`, scanErr);
          }
        }

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

    // ── 5. AI enrichment ────────────────────────────────────────────────────
    alerts = await enrichWithAI(detections, today, keyContextMap).catch(() =>
      detections.map((d) => ({
        ...d,
        id: `${d.provider}-${d.subject}-${d.type}`,
        detectedAt: today,
        detail: d.message,
        investigateSteps: [],
      }))
    );

    // ── 6. Persist results — subsequent runs skip steps 3-5 ─────────────────
    await persistAlerts(alerts, today);

    // ── 7. Send digest ──────────────────────────────────────────────────────
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
      cached: false,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/daily-digest]", err);
    return NextResponse.json({ error: msg, startedAt }, { status: 500 });
  }
}
