/**
 * GET /api/cron/pricing
 *
 * Fetches live model pricing from the LiteLLM OSS pricing JSON and upserts into
 * the model_pricing table. Runs every 6 hours via Vercel Cron.
 *
 * Also fires alert webhooks if any model's input price changed > PRICE_CHANGE_ALERT_PCT (20%).
 *
 * Source: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { PRICING_CATALOG } from "@/lib/router/pricing";
import { deliverWebhookEvent } from "@/lib/webhooks/deliver";

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// Models we care about — cross-reference with our catalog
const TRACKED_MODEL_IDS = new Set(PRICING_CATALOG.map((m) => m.modelId));

// Map LiteLLM provider keys to our provider names
const PROVIDER_MAP: Record<string, string> = {
  openai:    "openai",
  anthropic: "anthropic",
  google:    "google",
  groq:      "groq",
  mistral:   "mistral",
  "vertex_ai-language-models": "google",
};

const PRICE_CHANGE_ALERT_PCT = parseFloat(process.env.PRICE_CHANGE_ALERT_PCT ?? "20");

interface LiteLLMEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  max_tokens?: number;
  max_input_tokens?: number;
  litellm_provider?: string;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("cron_secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch LiteLLM pricing JSON
  let litellmData: Record<string, LiteLLMEntry>;
  try {
    const res = await fetch(LITELLM_PRICING_URL, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`LiteLLM fetch failed: ${res.status}`);
    litellmData = await res.json() as Record<string, LiteLLMEntry>;
  } catch (e) {
    console.error("[cron/pricing] Failed to fetch LiteLLM pricing:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fetch failed" }, { status: 502 });
  }

  // Read current DB prices for change detection
  const currentPrices = await db.select({ modelId: schema.modelPricing.modelId, inputPer1M: schema.modelPricing.inputPer1M })
    .from(schema.modelPricing);
  const priceMap = new Map(currentPrices.map((r) => [r.modelId, parseFloat(r.inputPer1M as string)]));

  const upserted: string[] = [];
  const priceChanges: Array<{ modelId: string; oldPrice: number; newPrice: number; changePct: number }> = [];

  for (const [modelId, entry] of Object.entries(litellmData)) {
    // Only track models in our catalog
    if (!TRACKED_MODEL_IDS.has(modelId)) continue;
    if (!entry.input_cost_per_token) continue;

    const catalogEntry = PRICING_CATALOG.find((m) => m.modelId === modelId);
    const provider = PROVIDER_MAP[entry.litellm_provider ?? ""] ?? catalogEntry?.provider ?? "unknown";

    const inputPer1M = (entry.input_cost_per_token * 1_000_000);
    const outputPer1M = ((entry.output_cost_per_token ?? 0) * 1_000_000);
    const cacheReadPer1M = entry.cache_read_input_token_cost
      ? entry.cache_read_input_token_cost * 1_000_000
      : null;

    // Detect significant price changes
    const prevPrice = priceMap.get(modelId);
    if (prevPrice !== undefined && prevPrice > 0) {
      const changePct = Math.abs((inputPer1M - prevPrice) / prevPrice) * 100;
      if (changePct >= PRICE_CHANGE_ALERT_PCT) {
        priceChanges.push({ modelId, oldPrice: prevPrice, newPrice: inputPer1M, changePct: Math.round(changePct) });
      }
    }

    await db.insert(schema.modelPricing).values({
      modelId,
      provider,
      displayName: catalogEntry?.displayName ?? modelId,
      inputPer1M: inputPer1M.toFixed(6),
      outputPer1M: outputPer1M.toFixed(6),
      cacheReadPer1M: cacheReadPer1M?.toFixed(6) ?? null,
      contextWindow: entry.max_input_tokens ?? entry.max_tokens ?? catalogEntry?.contextWindow ?? null,
      maxOutputTokens: entry.max_tokens ?? null,
      source: "litellm",
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: schema.modelPricing.modelId,
      set: {
        inputPer1M: inputPer1M.toFixed(6),
        outputPer1M: outputPer1M.toFixed(6),
        cacheReadPer1M: cacheReadPer1M?.toFixed(6) ?? null,
        source: "litellm",
        updatedAt: new Date(),
      },
    });

    upserted.push(modelId);
  }

  // Fire webhooks for significant price changes
  if (priceChanges.length > 0) {
    console.log(`[cron/pricing] ${priceChanges.length} significant price changes detected`);
    await deliverWebhookEvent("model.price_changed", {
      changes: priceChanges,
      ranAt: new Date().toISOString(),
    }).catch((e) => console.warn("[cron/pricing] webhook delivery failed:", e));
  }

  return NextResponse.json({
    upserted: upserted.length,
    models: upserted,
    priceChanges,
    ranAt: new Date().toISOString(),
  });
}
