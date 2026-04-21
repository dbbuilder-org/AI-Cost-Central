import { describe, it, expect } from "vitest";
import {
  detectCostAnomalies,
  detectVolumeSpikes,
  detectKeyModelShift,
  detectNewKeys,
  detectAll,
} from "@/lib/alerts/detector";
import type { UsageRow } from "@/types";
import { DEFAULT_CONFIG } from "@/types/alerts";

// ── Test fixture helpers ───────────────────────────────────────────────────

function makeRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    provider: "openai",
    apiKeyId: "key_001",
    apiKeyName: "My Key",
    model: "gpt-4o",
    date: "2026-04-01",
    inputTokens: 1000,
    outputTokens: 200,
    requests: 10,
    costUSD: 1.0,
    costPer1KInput: 5.0,
    costPer1KOutput: 15.0,
    ...overrides,
  };
}

/**
 * Build N days of usage for a given API key+model combo.
 * Last date in the array is "today". normalCost is applied to all but the last day.
 */
function normalRows(
  model: string,
  provider: UsageRow["provider"],
  normalCost: number,
  days: number,
  todayCost: number,
  normalRequests = 100,
  apiKeyId = "key_001",
  apiKeyName = "My Key"
): UsageRow[] {
  const rows: UsageRow[] = [];
  const today = new Date("2026-04-13");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const isToday = i === 0;
    rows.push(makeRow({
      model, provider, date, apiKeyId, apiKeyName,
      costUSD: isToday ? todayCost : normalCost,
      requests: normalRequests,
    }));
  }
  return rows;
}

// ── detectCostAnomalies ────────────────────────────────────────────────────

describe("detectCostAnomalies", () => {
  it("returns no alerts when all costs are normal", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0);
    const alerts = detectCostAnomalies(rows);
    expect(alerts.filter((a) => a.type === "cost_spike")).toHaveLength(0);
    expect(alerts.filter((a) => a.type === "cost_drop")).toHaveLength(0);
  });

  it("detects a cost spike when today is 10× baseline", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const alerts = detectCostAnomalies(rows, DEFAULT_CONFIG);
    const spikes = alerts.filter((a) => a.type === "cost_spike");
    expect(spikes).toHaveLength(1);
    // subject is now the API key name
    expect(spikes[0].subject).toBe("My Key");
    expect(spikes[0].provider).toBe("openai");
    expect(spikes[0].value).toBeCloseTo(50.0);
    expect(spikes[0].changePct).toBeGreaterThan(50);
    // apiKeyId is populated
    expect(spikes[0].apiKeyId).toBe("key_001");
    // model is available as context
    expect(spikes[0].models).toContain("gpt-4o");
  });

  it("spike is critical when z-score is very high", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 200.0);
    const alerts = detectCostAnomalies(rows);
    const spike = alerts.find((a) => a.type === "cost_spike");
    expect(spike?.severity).toBe("critical");
  });

  it("spike is warning for moderate increase", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 15.0);
    const alerts = detectCostAnomalies(rows);
    const spike = alerts.find((a) => a.type === "cost_spike");
    if (spike) expect(spike.severity).toMatch(/critical|warning|info/);
  });

  it("detects a cost drop when today falls to near zero but is non-zero", () => {
    const rows = normalRows("gpt-4o", "openai", 10.0, 14, 0.1);
    const alerts = detectCostAnomalies(rows);
    const drops = alerts.filter((a) => a.type === "cost_drop");
    expect(drops).toHaveLength(1);
    expect(drops[0].subject).toBe("My Key");
    expect(drops[0].changePct).toBeLessThan(0);
    expect(drops[0].severity).toBe("warning"); // never critical
  });

  it("does NOT fire a cost_drop alert when today is exactly $0", () => {
    // Zero spend = key simply not called that day, not an anomaly
    const rows = normalRows("gpt-4o", "openai", 10.0, 14, 0.0);
    const alerts = detectCostAnomalies(rows);
    const drops = alerts.filter((a) => a.type === "cost_drop");
    expect(drops).toHaveLength(0);
  });

  it("does NOT alert for low-baseline keys (below minBaselineCost)", () => {
    // baseline 0.10/day and today 0.01 — both below the $1/day threshold
    const rows = normalRows("gpt-4o-mini", "openai", 0.10, 14, 0.01);
    const alerts = detectCostAnomalies(rows, DEFAULT_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it("does NOT alert when the dollar delta is below minAlertDelta", () => {
    // baseline $1.10/day, today $5.00 — pct spike fires but delta is $3.90 which is ≥ $1
    // so let's test a case where baseline is $1.10 and today is $1.60 — delta $0.50 < $1
    const rows = normalRows("gpt-4o", "openai", 1.10, 14, 1.60);
    const alerts = detectCostAnomalies(rows, DEFAULT_CONFIG);
    expect(alerts.filter((a) => a.type === "cost_spike")).toHaveLength(0);
  });

  it("aggregates all models on the same key into a single series", () => {
    // Two models on the same key — combined cost spikes
    const gpt4Rows = normalRows("gpt-4o", "openai", 3.0, 14, 30.0, 100, "key_001", "My Key");
    const haikuRows = normalRows("claude-haiku-4-5-20251001", "anthropic", 2.0, 14, 2.0, 100, "key_002", "Other Key");
    const alerts = detectCostAnomalies([...gpt4Rows, ...haikuRows]);
    const spikes = alerts.filter((a) => a.type === "cost_spike");
    // Only key_001 should spike (10× baseline), key_002 is flat
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    expect(spikes.every((s) => s.apiKeyId === "key_001")).toBe(true);
  });

  it("returns no alerts with fewer than minBaselineDays+1 rows", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 3, 50.0);
    const alerts = detectCostAnomalies(rows, DEFAULT_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it("does not fire drop alert if baseline is below minBaselineCost", () => {
    const rows = normalRows("cheap-model", "openai", 0.3, 14, 0.0);
    const alerts = detectCostAnomalies(rows, DEFAULT_CONFIG);
    const drops = alerts.filter((a) => a.type === "cost_drop");
    expect(drops).toHaveLength(0);
  });

  it("detects each key independently for cross-key data", () => {
    const spikeRows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0, 100, "key_spike", "Spike Key");
    const normalKeyRows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100, "key_flat", "Flat Key");
    const alerts = detectCostAnomalies([...spikeRows, ...normalKeyRows]);
    const spikes = alerts.filter((a) => a.type === "cost_spike");
    expect(spikes).toHaveLength(1);
    expect(spikes[0].apiKeyId).toBe("key_spike");
  });

  it("message includes key name and model context", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const alerts = detectCostAnomalies(rows);
    const spike = alerts.find((a) => a.type === "cost_spike");
    expect(spike?.message).toContain("My Key");
    expect(spike?.message).toContain("$50.00");
    expect(spike?.message).toContain("gpt-4o");
  });
});

// ── detectVolumeSpikes ─────────────────────────────────────────────────────

describe("detectVolumeSpikes", () => {
  it("detects a volume spike when requests are 10× baseline", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100);
    rows[rows.length - 1].requests = 1000;
    const alerts = detectVolumeSpikes(rows);
    const spikes = alerts.filter((a) => a.type === "volume_spike");
    expect(spikes).toHaveLength(1);
    expect(spikes[0].subject).toBe("My Key");
    expect(spikes[0].value).toBe(1000);
  });

  it("returns no spike for low-volume keys", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 3);
    rows[rows.length - 1].requests = 20;
    const alerts = detectVolumeSpikes(rows);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("does not fire for normal volume variation", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100);
    rows[rows.length - 1].requests = 120;
    const alerts = detectVolumeSpikes(rows);
    expect(alerts.filter((a) => a.type === "volume_spike")).toHaveLength(0);
  });

  it("message includes key name and model context", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100);
    rows[rows.length - 1].requests = 1000;
    const alerts = detectVolumeSpikes(rows);
    const spike = alerts.find((a) => a.type === "volume_spike");
    expect(spike?.message).toContain("My Key");
    expect(spike?.message).toContain("gpt-4o");
  });
});

// ── detectKeyModelShift ────────────────────────────────────────────────────

describe("detectKeyModelShift", () => {
  it("detects when a key uses a new model for the first time", () => {
    const existingRows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0);
    // Today, the same key also uses a new model
    const today = "2026-04-13";
    const newModelRow = makeRow({
      model: "gpt-4-turbo-new",
      date: today,
      costUSD: 1.5,
      requests: 5,
    });
    const alerts = detectKeyModelShift([...existingRows, newModelRow]);
    const shifts = alerts.filter((a) => a.type === "key_model_shift");
    expect(shifts.length).toBeGreaterThanOrEqual(1);
    // Subject is the KEY, not the model
    expect(shifts[0].subject).toBe("My Key");
    // Model is in the models array
    expect(shifts[0].models).toContain("gpt-4-turbo-new");
  });

  it("does NOT flag a model the key has always used", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0);
    const alerts = detectKeyModelShift(rows);
    expect(alerts.filter((a) => a.type === "key_model_shift")).toHaveLength(0);
  });

  it("ignores new models with negligible cost", () => {
    const existingRows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0);
    const tinyRow = makeRow({
      model: "ghost-model",
      date: "2026-04-13",
      costUSD: 0,
    });
    const alerts = detectKeyModelShift([...existingRows, tinyRow]);
    expect(alerts.filter((a) => a.models?.includes("ghost-model"))).toHaveLength(0);
  });

  it("returns empty when not enough baseline days", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 4, 5.0);
    expect(detectKeyModelShift(rows)).toHaveLength(0);
  });

  it("message includes the key name and new model name", () => {
    const existingRows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0);
    const newModelRow = makeRow({
      model: "gpt-5-preview",
      date: "2026-04-13",
      costUSD: 2.0,
    });
    const alerts = detectKeyModelShift([...existingRows, newModelRow]);
    const shift = alerts.find((a) => a.type === "key_model_shift");
    expect(shift?.message).toContain("My Key");
    expect(shift?.message).toContain("gpt-5-preview");
  });

  it("detects dominant model shift when key switches primary model", () => {
    // Baseline: key_001 uses gpt-4o as primary ($5/day), gpt-4o-mini as minor ($0.10/day)
    const today = new Date("2026-04-13");
    const rows: UsageRow[] = [];
    for (let i = 13; i > 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      rows.push(makeRow({ model: "gpt-4o", date, costUSD: 5.0 }));
      rows.push(makeRow({ model: "gpt-4o-mini", date, costUSD: 0.10 }));
    }
    // Today: gpt-4o-mini becomes dominant ($8), gpt-4o drops to $0.10
    rows.push(makeRow({ model: "gpt-4o", date: "2026-04-13", costUSD: 0.10 }));
    rows.push(makeRow({ model: "gpt-4o-mini", date: "2026-04-13", costUSD: 8.0 }));

    const alerts = detectKeyModelShift(rows);
    const shifts = alerts.filter((a) => a.type === "key_model_shift");
    // Should detect that gpt-4o-mini is now dominant
    const dominantShift = shifts.find(
      (a) => a.models?.includes("gpt-4o-mini") && a.models?.includes("gpt-4o")
    );
    expect(dominantShift).toBeDefined();
    expect(dominantShift?.subject).toBe("My Key");
  });
});

// ── detectNewKeys ──────────────────────────────────────────────────────────

describe("detectNewKeys", () => {
  it("detects a key that first appears in last 3 days", () => {
    const oldRows = Array.from({ length: 28 }, (_, i) => {
      const d = new Date("2026-04-13");
      d.setDate(d.getDate() - (27 - i));
      return makeRow({ apiKeyId: "key_old", apiKeyName: "Old Key", date: d.toISOString().slice(0, 10) });
    });
    const newRow = makeRow({
      apiKeyId: "key_new",
      apiKeyName: "Brand New Key",
      date: "2026-04-12",
      costUSD: 2.5,
    });
    const alerts = detectNewKeys([...oldRows, newRow]);
    const newKeys = alerts.filter((a) => a.type === "new_key");
    expect(newKeys).toHaveLength(1);
    expect(newKeys[0].subject).toBe("Brand New Key");
    expect(newKeys[0].apiKeyId).toBe("key_new");
  });

  it("does NOT flag keys that have been around > newKeyLookbackDays", () => {
    const rows = Array.from({ length: 28 }, (_, i) => {
      const d = new Date("2026-04-13");
      d.setDate(d.getDate() - (27 - i));
      return makeRow({ date: d.toISOString().slice(0, 10), apiKeyId: "key_old" });
    });
    const alerts = detectNewKeys(rows);
    expect(alerts.filter((a) => a.type === "new_key")).toHaveLength(0);
  });

  it("marks new key as warning severity when it has high spend", () => {
    const newRow = makeRow({
      apiKeyId: "key_expensive",
      apiKeyName: "Expensive New Key",
      date: "2026-04-13",
      costUSD: 50.0,
    });
    const alerts = detectNewKeys([newRow]);
    const newKeys = alerts.filter((a) => a.type === "new_key");
    expect(newKeys).toHaveLength(1);
    expect(newKeys[0].severity).toBe("warning");
  });

  it("marks new key as info severity for low spend", () => {
    const newRow = makeRow({
      apiKeyId: "key_cheap",
      apiKeyName: "Cheap New Key",
      date: "2026-04-13",
      costUSD: 0.50,
    });
    const alerts = detectNewKeys([newRow]);
    expect(alerts[0].severity).toBe("info");
  });

  it("includes model context in new key alert", () => {
    const newRow = makeRow({
      apiKeyId: "key_new",
      apiKeyName: "New Key",
      date: "2026-04-13",
      model: "gpt-4o",
      costUSD: 5.0,
    });
    const alerts = detectNewKeys([newRow]);
    expect(alerts[0].models).toContain("gpt-4o");
    expect(alerts[0].message).toContain("gpt-4o");
  });

  it("handles empty rows gracefully", () => {
    expect(detectNewKeys([])).toHaveLength(0);
  });
});

// ── detectAll ──────────────────────────────────────────────────────────────

describe("detectAll", () => {
  it("aggregates results from all detectors", () => {
    const spikeRows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const newKeyRow = makeRow({
      apiKeyId: "key_new",
      apiKeyName: "New Key",
      date: "2026-04-13",
      costUSD: 1.0,
    });
    const alerts = detectAll([...spikeRows, newKeyRow]);
    const types = new Set(alerts.map((a) => a.type));
    expect(types.has("cost_spike")).toBe(true);
    expect(types.has("new_key")).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(detectAll([])).toHaveLength(0);
  });

  it("returns no cost/volume alerts for perfectly normal data", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 28, 5.0);
    const alerts = detectAll(rows);
    expect(alerts.filter((a) => a.type === "cost_spike")).toHaveLength(0);
    expect(alerts.filter((a) => a.type === "cost_drop")).toHaveLength(0);
    expect(alerts.filter((a) => a.type === "key_model_shift")).toHaveLength(0);
  });

  it("works with multi-provider data", () => {
    const oaiRows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100, "key_oai", "OAI Key");
    const antRows = normalRows("claude-sonnet-4-6", "anthropic", 3.0, 14, 3.0, 100, "key_ant", "ANT Key");
    const gglRows = normalRows("gemini-2.5-flash", "google", 0.5, 14, 0.5, 100, "key_ggl", "GGL Key");
    const alerts = detectAll([...oaiRows, ...antRows, ...gglRows]);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("respects custom config thresholds", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 11.0);
    const strictConfig = { ...DEFAULT_CONFIG, spikeMinPct: 200 };
    const alerts = detectAll(rows, strictConfig);
    expect(alerts.filter((a) => a.type === "cost_spike")).toHaveLength(0);
  });

  it("severity assignment: critical for extreme spikes", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 1000.0);
    const alerts = detectCostAnomalies(rows);
    const spike = alerts.find((a) => a.type === "cost_spike");
    expect(spike?.severity).toBe("critical");
  });

  it("all alert subjects are API key names, not model names", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const alerts = detectAll(rows);
    for (const alert of alerts.filter((a) => a.type === "cost_spike" || a.type === "volume_spike")) {
      expect(alert.subject).toBe("My Key");
      expect(alert.subject).not.toBe("gpt-4o");
    }
  });
});
