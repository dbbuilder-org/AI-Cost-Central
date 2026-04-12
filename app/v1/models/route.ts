/**
 * GET /v1/models — OpenAI-compatible model list.
 * Returns SmartRouter virtual models + all catalog models.
 */
import { NextResponse } from "next/server";
import { PRICING_CATALOG } from "@/lib/router/pricing";
import { VIRTUAL_MODELS } from "@/lib/router/engine";

const CREATED_AT = Math.floor(new Date("2025-01-01").getTime() / 1000);

export async function GET() {
  const virtualModels = Object.keys(VIRTUAL_MODELS).map((id) => ({
    id,
    object: "model",
    created: CREATED_AT,
    owned_by: "smartrouter",
    description: `SmartRouter virtual model — routes to best ${VIRTUAL_MODELS[id]}-tier model for your task`,
  }));

  const catalogModels = PRICING_CATALOG.map((m) => ({
    id: m.modelId,
    object: "model",
    created: CREATED_AT,
    owned_by: m.provider,
    display_name: m.displayName,
    context_window: m.contextWindow,
    pricing: {
      input_per_1m_usd: m.inputPer1M,
      output_per_1m_usd: m.outputPer1M,
      ...(m.cacheReadPer1M !== undefined ? { cache_read_per_1m_usd: m.cacheReadPer1M } : {}),
    },
  }));

  return NextResponse.json({
    object: "list",
    data: [...virtualModels, ...catalogModels],
  });
}
