/**
 * GET /api/models/pricing
 *
 * Returns current model pricing from DB (updated by /api/cron/pricing every 6h).
 * Falls back to hardcoded catalog if DB is empty.
 * Public route — no auth required (pricing data is not sensitive).
 */
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { PRICING_CATALOG } from "@/lib/router/pricing";

export async function GET() {
  try {
    const dbPricing = await db.select().from(schema.modelPricing)
      .orderBy(schema.modelPricing.provider, schema.modelPricing.modelId);

    if (dbPricing.length > 0) {
      return NextResponse.json({
        source: "db",
        updatedAt: dbPricing.reduce((max, r) => r.updatedAt > max ? r.updatedAt : max, new Date(0)).toISOString(),
        models: dbPricing.map((m) => ({
          modelId:         m.modelId,
          provider:        m.provider,
          displayName:     m.displayName,
          inputPer1M:      parseFloat(m.inputPer1M as string),
          outputPer1M:     parseFloat(m.outputPer1M as string),
          cacheReadPer1M:  m.cacheReadPer1M ? parseFloat(m.cacheReadPer1M as string) : null,
          contextWindow:   m.contextWindow,
          source:          m.source,
        })),
      });
    }

    // Fallback to hardcoded catalog
    return NextResponse.json({
      source: "catalog",
      updatedAt: null,
      models: PRICING_CATALOG.map((m) => ({
        modelId:        m.modelId,
        provider:       m.provider,
        displayName:    m.displayName,
        inputPer1M:     m.inputPer1M,
        outputPer1M:    m.outputPer1M,
        cacheReadPer1M: m.cacheReadPer1M ?? null,
        contextWindow:  m.contextWindow,
        source:         "catalog",
      })),
    });
  } catch {
    // If DB is unreachable, always return catalog
    return NextResponse.json({
      source: "catalog",
      updatedAt: null,
      models: PRICING_CATALOG.map((m) => ({
        modelId: m.modelId, provider: m.provider, displayName: m.displayName,
        inputPer1M: m.inputPer1M, outputPer1M: m.outputPer1M,
        cacheReadPer1M: m.cacheReadPer1M ?? null, contextWindow: m.contextWindow, source: "catalog",
      })),
    });
  }
}
