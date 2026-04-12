"use client";
import { create } from "zustand";
import type { UsageRow, SpendSummary, Recommendation, DateRange } from "@/types";
import { buildSummary } from "@/lib/transform";

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
      // Server uses OPENAI_ADMIN_KEY env var — no client key needed
      const res = await fetch("/api/openai/usage?days=28");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Failed to fetch usage");
      }
      const rows: UsageRow[] = await res.json();
      const summary = buildSummary(rows, parseInt(get().dateRange));
      set({ rows, summary, loading: false, lastFetched: Date.now() });
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
