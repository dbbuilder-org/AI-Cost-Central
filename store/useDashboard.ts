"use client";
import { create } from "zustand";
import type { UsageRow, SpendSummary, Recommendation, DateRange } from "@/types";
import { buildSummary, transformAnthropic, transformGoogle } from "@/lib/transform";

interface DashboardState {
  rows: UsageRow[];
  summary: SpendSummary | null;
  recommendations: Recommendation[];
  loading: boolean;
  analyzing: boolean;
  error: string | null;
  dateRange: DateRange;
  lastFetched: number | null;

  fetchData: () => Promise<void>;
  runAnalysis: () => Promise<void>;
  setDateRange: (r: DateRange) => void;
}

export const useDashboard = create<DashboardState>((set, get) => ({
  rows: [],
  summary: null,
  recommendations: [],
  loading: false,
  analyzing: false,
  error: null,
  dateRange: "28d",
  lastFetched: null,

  fetchData: async () => {
    const now = Date.now();
    const last = get().lastFetched;
    if (last && now - last < 60_000) return;

    set({ loading: true, error: null });
    try {
      const [oaiRes, anthropicRes, googleRes, srRes] = await Promise.allSettled([
        fetch("/api/openai/usage?days=28"),
        fetch("/api/anthropic/usage"),
        fetch("/api/google/usage"),
        fetch("/api/smartrouter/usage?days=28"),
      ]);

      const allRows: UsageRow[] = [];
      const warnings: string[] = [];

      if (oaiRes.status === "fulfilled") {
        if (oaiRes.value.ok) {
          const data: UsageRow[] = await oaiRes.value.json();
          allRows.push(...data);
        } else {
          const err = await oaiRes.value.json().catch(() => ({ error: oaiRes.value.statusText }));
          warnings.push(`OpenAI: ${err.error ?? "fetch failed"}`);
        }
      }

      if (anthropicRes.status === "fulfilled") {
        if (anthropicRes.value.ok) {
          const data = await anthropicRes.value.json();
          allRows.push(...transformAnthropic(data.rows ?? []));
        } else {
          const err = await anthropicRes.value.json().catch(() => ({ error: anthropicRes.value.statusText }));
          warnings.push(`Anthropic: ${err.error ?? "fetch failed"}`);
        }
      }

      if (googleRes.status === "fulfilled") {
        if (googleRes.value.ok) {
          const data = await googleRes.value.json();
          allRows.push(...transformGoogle(data.rows ?? []));
        } else {
          const err = await googleRes.value.json().catch(() => ({ error: googleRes.value.statusText }));
          warnings.push(`Google: ${err.error ?? "fetch failed"}`);
        }
      }

      // SmartRouter-proxied usage (non-fatal if unavailable)
      if (srRes.status === "fulfilled" && srRes.value.ok) {
        const data: UsageRow[] = await srRes.value.json();
        allRows.push(...data);
      }

      const days = parseInt(get().dateRange);
      const summary = buildSummary(allRows, days);
      set({
        rows: allRows,
        summary,
        loading: false,
        lastFetched: Date.now(),
        error: warnings.length > 0 ? `Partial data — ${warnings.join("; ")}` : null,
      });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : "Unknown error", loading: false });
    }
  },

  runAnalysis: async () => {
    const { summary } = get();
    if (!summary) return;
    set({ analyzing: true });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(summary),
      });
      if (!res.ok) throw new Error(await res.text());
      const recs: Recommendation[] = await res.json();
      set({ recommendations: recs, analyzing: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : "Analysis failed", analyzing: false });
    }
  },

  setDateRange: (dateRange) => {
    const { rows } = get();
    const days = parseInt(dateRange);
    const summary = rows.length > 0 ? buildSummary(rows, days) : null;
    set({ dateRange, summary });
  },
}));
