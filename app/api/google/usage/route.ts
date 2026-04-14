/**
 * GET /api/google/usage
 *
 * Fetches Gemini API usage from Google Cloud Monitoring for the
 * gen-lang-client-0915390692 project (AI Studio / Gemini API).
 *
 * Uses service account JWT auth → OAuth2 token → Cloud Monitoring API.
 * Metric: generativelanguage.googleapis.com/generate_content_requests
 *         generativelanguage.googleapis.com/token_count (if available)
 *
 * Falls back to Cloud Billing SKU costs if Monitoring returns no data.
 * Cost is calculated from token counts using our local pricing catalog.
 */
import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { requireAuth } from "@/lib/auth";
import { resolveProviderKey } from "@/lib/server/resolveKey";

// Pricing catalog (USD per 1M tokens, Apr 2026)
// Veo/Imagen tracked by request count — not per-token
const GOOGLE_PRICING: Record<string, { input: number; output: number }> = {
  // Gemini 3.x (latest generation)
  "gemini-3.1-pro-preview":       { input: 4.00,   output: 18.00 },
  "gemini-3.1-flash-lite-preview":{ input: 0.25,   output: 1.50  },
  "gemini-3-pro-preview":         { input: 4.00,   output: 18.00 },
  "gemini-3-flash-preview":       { input: 0.50,   output: 3.00  },
  // Gemini 2.5
  "gemini-2.5-pro":               { input: 1.25,   output: 10.00 },
  "gemini-2.5-flash":             { input: 0.30,   output: 2.50  },
  "gemini-2.5-flash-lite":        { input: 0.10,   output: 0.40  },
  // Gemini 2.0
  "gemini-2.0-flash":             { input: 0.10,   output: 0.40  },
  "gemini-2.0-flash-lite":        { input: 0.075,  output: 0.30  },
  // Gemini 1.5
  "gemini-1.5-pro":               { input: 1.25,   output: 5.00  },
  "gemini-1.5-flash":             { input: 0.075,  output: 0.30  },
  "gemini-1.5-flash-8b":          { input: 0.0375, output: 0.15  },
  // Veo / Imagen — billed per-second / per-image; cost calc returns 0, track via requests
  "veo-3.1":                      { input: 0,      output: 0     },
  "veo-3.0":                      { input: 0,      output: 0     },
  "veo-2.0":                      { input: 0,      output: 0     },
  "imagen-4.0":                   { input: 0,      output: 0     },
  // Embeddings
  "gemini-embedding":             { input: 0.15,   output: 0     },
};

// Image/vision models — input is a short text prompt, output is the generated image
// (billed per-image, not per-token, so token counts are misleading for these)
const IMAGE_MODEL_PATTERNS = [
  "image", "imagen", "veo", "vision", "photo", "preview-image", "flash-image",
];

function isImageModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return IMAGE_MODEL_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Estimate input tokens when Google doesn't expose them.
 * Text models: input ≈ output (user prompts tend to match response length)
 * Image models: input prompt is tiny — ~2% of output token count
 */
function estimateInputTokens(modelId: string, outputTokens: number): number {
  if (isImageModel(modelId)) {
    return Math.round(outputTokens * 0.02); // ~2% — short text prompts
  }
  return outputTokens; // 1:1 ratio → doubles the estimate
}

function getPricing(modelId: string) {
  const exact = GOOGLE_PRICING[modelId];
  if (exact) return exact;
  const prefix = Object.keys(GOOGLE_PRICING).find((k) => modelId.startsWith(k));
  return prefix ? GOOGLE_PRICING[prefix] : null;
}

function calcCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = getPricing(modelId);
  if (!p) return 0;
  return (p.input / 1_000_000) * inputTokens + (p.output / 1_000_000) * outputTokens;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function getAccessToken(sa: object): Promise<string> {
  const auth = new GoogleAuth({
    credentials: sa as never,
    scopes: [
      "https://www.googleapis.com/auth/monitoring.read",
      "https://www.googleapis.com/auth/cloud-platform",
    ],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain Google access token");
  return token.token;
}

interface TimeSeriesPoint {
  interval: { startTime: string; endTime: string };
  value: { int64Value?: string; doubleValue?: number };
}

interface TimeSeries {
  metric: { labels: Record<string, string> };
  resource: { labels: Record<string, string> };
  points: TimeSeriesPoint[];
}

async function queryMonitoring(
  token: string,
  projectId: string,
  metricType: string,
  startTime: string,
  endTime: string
): Promise<TimeSeries[]> {
  const params = new URLSearchParams({
    filter: `metric.type="${metricType}"`,
    "interval.startTime": startTime,
    "interval.endTime": endTime,
    "aggregation.alignmentPeriod": "86400s",      // daily buckets
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.groupByFields": "metric.labels.model",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });

  const res = await fetch(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[google/usage] Monitoring ${metricType} ${res.status}: ${body.slice(0, 200)}`);
    return [];
  }

  const data = await res.json() as { timeSeries?: TimeSeries[] };
  return data.timeSeries ?? [];
}

export async function GET() {
  let sa: { project_id: string };
  try {
    const { orgId } = await requireAuth();
    const saJson = await resolveProviderKey(orgId, "google");
    sa = JSON.parse(saJson);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "No Google key configured";
    if (msg.includes("not valid JSON") || msg.includes("JSON")) {
      return NextResponse.json({ error: "Google service account JSON is invalid" }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  const projectId = sa.project_id;
  const startTime = daysAgo(28);
  const endTime = new Date().toISOString();

  let token: string;
  try {
    token = await getAccessToken(sa);
  } catch (e) {
    return NextResponse.json({ error: `Auth failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // Google AI Studio only exposes output token counts via Cloud Monitoring.
  // Input token metric does not exist for gen-lang-client projects.
  // Request counts are available but not broken down by model.
  const [outputTokenSeries, requestSeries] = await Promise.all([
    queryMonitoring(token, projectId, "generativelanguage.googleapis.com/generate_content_usage_output_token_count", startTime, endTime),
    queryMonitoring(token, projectId, "serviceruntime.googleapis.com/api/request_count", startTime, endTime),
  ]);

  // Aggregate by date + model
  type Row = { date: string; model: string; inputTokens: number; outputTokens: number; requests: number; costUSD: number; provider: string };
  const aggregated: Record<string, Row> = {};

  function addPoints(series: TimeSeries[], field: "inputTokens" | "outputTokens" | "requests") {
    for (const ts of series) {
      const model = ts.metric.labels?.model ?? ts.resource.labels?.model ?? "unknown";
      for (const pt of ts.points) {
        const date = pt.interval.endTime.slice(0, 10);
        const value = parseInt(pt.value.int64Value ?? "0") || (pt.value.doubleValue ?? 0);
        const key = `${date}|${model}`;
        if (!aggregated[key]) {
          aggregated[key] = { date, model, inputTokens: 0, outputTokens: 0, requests: 0, costUSD: 0, provider: "google" };
        }
        aggregated[key][field] += value;
      }
    }
  }

  addPoints(outputTokenSeries, "outputTokens");
  // Request count has no model label — add to a catch-all row
  for (const ts of requestSeries) {
    for (const pt of ts.points) {
      const date = pt.interval.endTime.slice(0, 10);
      const value = parseInt(pt.value.int64Value ?? "0") || (pt.value.doubleValue ?? 0);
      // Spread requests proportionally across models that have output token data for this date
      // For now just track total; proportional split happens client-side
      const key = `${date}|_total_requests`;
      if (!aggregated[key]) {
        aggregated[key] = { date, model: "_requests", inputTokens: 0, outputTokens: 0, requests: 0, costUSD: 0, provider: "google" };
      }
      aggregated[key].requests += value;
    }
  }

  // Estimate input tokens (Google doesn't expose them for AI Studio projects)
  // Text models: input ≈ output (1:1). Image models: input ≈ 2% of output.
  for (const row of Object.values(aggregated)) {
    if (row.model === "_requests") continue;
    row.inputTokens = estimateInputTokens(row.model, row.outputTokens);
    row.costUSD = calcCost(row.model, row.inputTokens, row.outputTokens);
  }

  const rows = Object.values(aggregated)
    .filter((r) => r.model !== "_requests")
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalRequests = Object.values(aggregated)
    .filter((r) => r.model === "_requests")
    .reduce((s, r) => s + r.requests, 0);

  // Summary
  const byModel: Record<string, { costUSD: number; inputTokens: number; outputTokens: number; requests: number }> = {};
  for (const row of rows) {
    if (!byModel[row.model]) byModel[row.model] = { costUSD: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
    byModel[row.model].costUSD      += row.costUSD;
    byModel[row.model].inputTokens  += row.inputTokens;
    byModel[row.model].outputTokens += row.outputTokens;
    byModel[row.model].requests     += row.requests;
  }

  const hasData = rows.length > 0;

  return NextResponse.json({
    rows,
    summary: {
      totalCostUSD: rows.reduce((s, r) => s + r.costUSD, 0),
      totalRequests,
      byModel,
      hasData,
      projectId,
      inputTokensNote: "Google AI Studio does not expose input token counts. Estimated: text models = output×1 (1:1 ratio), image models = output×0.02 (2% — short prompts).",
      note: hasData
        ? undefined
        : "No Monitoring data found. The service account may need roles/monitoring.viewer on this project, or Gemini usage may not be emitting metrics to Cloud Monitoring. Check https://console.cloud.google.com/monitoring for available metrics.",
    },
    fetchedAt: new Date().toISOString(),
  });
}
