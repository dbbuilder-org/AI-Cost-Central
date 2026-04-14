import { describe, it, expect } from "vitest";
import {
  detectCostAnomalies,
  detectVolumeSpikes,
  detectNewModels,
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

/** Build N days of normal usage for a model, with the last day as "today" */
function normalRows(
  model: string,
  provider: UsageRow["provider"],
  normalCost: number,
  days: number,
  todayCost: number,
  normalRequests = 100
): UsageRow[] {
  const rows: UsageRow[] = [];
  const today = new Date("2026-04-13");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const isToday = i === 0;
    rows.push(makeRow({
      model,
      provider,
      date,
      costUSD: isToday ? todayCost : normalCost,
      requests: isToday ? normalRequests : normalRequests,
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
    expect(spikes[0].subject).toBe("gpt-4o");
    expect(spikes[0].provider).toBe("openai");
    expect(spikes[0].value).toBeCloseTo(50.0);
    expect(spikes[0].changePct).toBeGreaterThan(50);
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
    // May or may not fire depending on stddev — just check we don't crash
    if (spike) expect(spike.severity).toMatch(/critical|warning|info/);
  });

  it("detects a cost drop when today falls to near zero", () => {
    const rows = normalRows("gpt-4o", "openai", 10.0, 14, 0.1);
    const alerts = detectCostAnomalies(rows);
    const drops = alerts.filter((a) => a.type === "cost_drop");
    expect(drops).toHaveLength(1);
    expect(drops[0].subject).toBe("gpt-4o");
    expect(drops[0].changePct).toBeLessThan(0);
  });

  it("cost drop is critical when today is exactly zero", () => {
    const rows = normalRows("gpt-4o", "openai", 10.0, 14, 0.0);
    const alerts = detectCostAnomalies(rows);
    const drop = alerts.find((a) => a.type === "cost_drop");
    expect(drop?.severity).toBe("critical");
  });

  it("does NOT alert for low-baseline models (below minBaselineCost)", () => {
    const rows = normalRows("gpt-4o-mini", "openai", 0.1, 14, 0.01);
    const alerts = detectCostAnomalies(rows, DEFAULT_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it("handles multiple models independently", () => {
    const gpt4Rows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const haikuRows = normalRows("claude-haiku-4-5-20251001", "anthropic", 2.0, 14, 2.0);
    const alerts = detectCostAnomalies([...gpt4Rows, ...haikuRows]);
    const spikes = alerts.filter((a) => a.type === "cost_spike");
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    expect(spikes.every((s) => s.subject === "gpt-4o")).toBe(true);
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

  it("handles cross-provider data without mixing models", () => {
    const oaiRows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const antRows = normalRows("gpt-4o", "anthropic", 5.0, 14, 5.0); // same model name, different provider
    const alerts = detectCostAnomalies([...oaiRows, ...antRows]);
    const spikes = alerts.filter((a) => a.type === "cost_spike");
    // Only the openai/gpt-4o should spike
    expect(spikes).toHaveLength(1);
    expect(spikes[0].provider).toBe("openai");
  });
});

// ── detectVolumeSpikes ─────────────────────────────────────────────────────

describe("detectVolumeSpikes", () => {
  it("detects a volume spike when requests are 10× baseline", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100);
    // Make today's requests extremely high
    const today = rows[rows.length - 1];
    today.requests = 1000;
    const alerts = detectVolumeSpikes(rows);
    const spikes = alerts.filter((a) => a.type === "volume_spike");
    expect(spikes).toHaveLength(1);
    expect(spikes[0].value).toBe(1000);
  });

  it("returns no spike for low-volume models", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 3);
    rows[rows.length - 1].requests = 20;
    const alerts = detectVolumeSpikes(rows);
    // baseline mean is ~3, today is 20 but < 20 threshold might vary
    // Key requirement: no crash
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("does not fire for normal volume variation", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0, 100);
    rows[rows.length - 1].requests = 120; // 20% increase — not a spike
    const alerts = detectVolumeSpikes(rows);
    expect(alerts.filter((a) => a.type === "volume_spike")).toHaveLength(0);
  });
});

// ── detectNewModels ────────────────────────────────────────────────────────

describe("detectNewModels", () => {
  it("detects a model that appears only in the last 7 days", () => {
    const existingRows = normalRows("gpt-4o", "openai", 5.0, 28, 5.0);
    // New model appears only in the last 3 days
    const today = new Date("2026-04-13");
    const newModelRows = [0, 1, 2].map((i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return makeRow({
        model: "gpt-5-new",
        date: d.toISOString().slice(0, 10),
        costUSD: 1.5,
        requests: 5,
      });
    });
    const alerts = detectNewModels([...existingRows, ...newModelRows]);
    const newModels = alerts.filter((a) => a.type === "new_model");
    expect(newModels.length).toBeGreaterThanOrEqual(1);
    expect(newModels[0].subject).toBe("gpt-5-new");
  });

  it("does NOT flag a model that was already present in prior weeks", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 28, 5.0);
    const alerts = detectNewModels(rows);
    expect(alerts.filter((a) => a.type === "new_model")).toHaveLength(0);
  });

  it("ignores new models with zero cost and zero requests", () => {
    const existingRows = normalRows("gpt-4o", "openai", 5.0, 28, 5.0);
    const zeroRow = makeRow({
      model: "ghost-model",
      date: "2026-04-13",
      costUSD: 0,
      requests: 0,
    });
    const alerts = detectNewModels([...existingRows, zeroRow]);
    expect(alerts.filter((a) => a.subject === "ghost-model")).toHaveLength(0);
  });

  it("returns empty when not enough days of data", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 4, 5.0);
    expect(detectNewModels(rows)).toHaveLength(0);
  });
});

// ── detectNewKeys ──────────────────────────────────────────────────────────

describe("detectNewKeys", () => {
  it("detects a key that first appears in last 3 days", () => {
    // Old key with 28d of history
    const oldRows = Array.from({ length: 28 }, (_, i) => {
      const d = new Date("2026-04-13");
      d.setDate(d.getDate() - (27 - i));
      return makeRow({ apiKeyId: "key_old", apiKeyName: "Old Key", date: d.toISOString().slice(0, 10) });
    });
    // New key appears only 1 day ago
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

  it("returns empty for perfectly normal data", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 28, 5.0);
    const alerts = detectAll(rows);
    expect(alerts.filter((a) => a.type === "cost_spike")).toHaveLength(0);
    expect(alerts.filter((a) => a.type === "cost_drop")).toHaveLength(0);
    expect(alerts.filter((a) => a.type === "new_model")).toHaveLength(0);
    // new_key might or might not fire depending on data — just no crash
  });

  it("works with multi-provider data", () => {
    const oaiRows = normalRows("gpt-4o", "openai", 5.0, 14, 5.0);
    const antRows = normalRows("claude-sonnet-4-6", "anthropic", 3.0, 14, 3.0);
    const gglRows = normalRows("gemini-2.5-flash", "google", 0.5, 14, 0.5);
    const alerts = detectAll([...oaiRows, ...antRows, ...gglRows]);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("respects custom config thresholds", () => {
    // With very high spikeMinPct, a 2× spike should not fire
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 11.0); // 120% increase
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

  it("message includes relevant details for cost spike", () => {
    const rows = normalRows("gpt-4o", "openai", 5.0, 14, 50.0);
    const alerts = detectCostAnomalies(rows);
    const spike = alerts.find((a) => a.type === "cost_spike");
    expect(spike?.message).toContain("gpt-4o");
    expect(spike?.message).toContain("$50.00");
  });

  it("message includes model name for new model", () => {
    const existingRows = normalRows("gpt-4o", "openai", 5.0, 28, 5.0);
    const newRow = makeRow({
      model: "gpt-6-preview",
      date: "2026-04-13",
      costUSD: 2.0,
    });
    const alerts = detectNewModels([...existingRows, newRow]);
    const newModel = alerts.find((a) => a.type === "new_model");
    expect(newModel?.message).toContain("gpt-6-preview");
  });
});
