"use client";
import { useMemo, useState, useCallback } from "react";
import { computeForecast } from "@/lib/forecast";
import type { DaySummary } from "@/types";
import type { Annotation } from "@/lib/db/schema";

interface Props {
  byDay: DaySummary[];
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CONFIDENCE_COLOR = {
  high:   "text-green-400",
  medium: "text-yellow-400",
  low:    "text-gray-500",
} as const;

const CONFIDENCE_LABEL = {
  high:   "High confidence",
  medium: "Medium confidence",
  low:    "Low confidence (noisy data)",
} as const;

export function SpendForecastCard({ byDay }: Props) {
  const points = useMemo(
    () => byDay.map((d) => ({ date: d.date, costUSD: d.costUSD })),
    [byDay],
  );

  const forecast = useMemo(() => computeForecast(points), [points]);

  // ── Annotation state ──────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  // Track which dates have at least one annotation (populated on first click)
  const [annotatedDates, setAnnotatedDates] = useState<Set<string>>(new Set());

  const openDate = useCallback(async (date: string) => {
    setSelectedDate(date);
    setAnnotations([]);
    setNoteText("");
    setAnnotationError(null);
    setLoadingAnnotations(true);
    try {
      const res = await fetch(
        `/api/annotations?entityType=usage_date&entityId=${encodeURIComponent(date)}`,
      );
      if (res.ok) {
        const data = await res.json() as { annotations: Annotation[] };
        setAnnotations(data.annotations);
        if (data.annotations.length > 0) {
          setAnnotatedDates((prev) => new Set([...prev, date]));
        }
      }
    } finally {
      setLoadingAnnotations(false);
    }
  }, []);

  const closePanel = () => {
    setSelectedDate(null);
    setAnnotations([]);
    setNoteText("");
    setAnnotationError(null);
  };

  const saveNote = async () => {
    if (!noteText.trim() || !selectedDate) return;
    setSavingNote(true);
    setAnnotationError(null);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: "usage_date",
          entityId: selectedDate,
          content: noteText.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      const data = await res.json() as { annotation: Annotation };
      setAnnotations((prev) => [...prev, data.annotation]);
      setAnnotatedDates((prev) => new Set([...prev, selectedDate]));
      setNoteText("");
    } catch (e) {
      setAnnotationError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await fetch(`/api/annotations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setAnnotations((prev) => {
        const updated = prev.filter((a) => a.id !== id);
        if (updated.length === 0 && selectedDate) {
          setAnnotatedDates((prev2) => {
            const next = new Set(prev2);
            next.delete(selectedDate);
            return next;
          });
        }
        return updated;
      });
    } catch {
      // non-critical
    }
  };

  if (!forecast || forecast.daysUsed < 3) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">
        Not enough daily data to generate a forecast. Need at least 3 days.
      </div>
    );
  }

  const trendPositive = forecast.slope > 0.005;
  const trendNegative = forecast.slope < -0.005;
  const trendArrow = trendPositive ? "▲" : trendNegative ? "▼" : "→";
  const trendColor = trendPositive ? "text-red-400" : trendNegative ? "text-green-400" : "text-gray-400";
  const slopeAbs = Math.abs(forecast.slope);

  const historicalSlice = points.slice(-14);
  const maxCost = Math.max(
    ...historicalSlice.map((p) => p.costUSD),
    ...forecast.forecastDays.map((d) => d.projectedUsd),
    0.01,
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Spend Forecast</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Linear trend from {forecast.daysUsed} days · {CONFIDENCE_LABEL[forecast.confidence]}
          </p>
        </div>
        <span className={`text-xs font-medium ${CONFIDENCE_COLOR[forecast.confidence]}`}>
          R² {(forecast.r2 * 100).toFixed(0)}%
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Month to Date</div>
          <div className="text-xl font-bold text-white">{fmt(forecast.mtdUsd)}</div>
        </div>

        <div className="bg-indigo-900/30 border border-indigo-800/50 rounded-lg p-4">
          <div className="text-xs text-indigo-400 mb-1">Projected Month Total</div>
          <div className="text-xl font-bold text-white">{fmt(forecast.projectedMonthTotal)}</div>
          <div className="text-xs text-indigo-400 mt-1">
            +{fmt(forecast.projectedMonthTotal - forecast.mtdUsd)} remaining
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Daily Trend</div>
          <div className={`text-xl font-bold ${trendColor}`}>
            {trendArrow} {fmt(slopeAbs)}/day
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {trendPositive ? "Spend rising" : trendNegative ? "Spend falling" : "Spend stable"}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Next Day Estimate</div>
          <div className="text-xl font-bold text-white">{fmt(forecast.projectedDailyCost)}</div>
          <div className="text-xs text-gray-500 mt-1">{forecast.daysRemaining} days left in month</div>
        </div>
      </div>

      {/* Mini bar chart: actual + projected */}
      {(historicalSlice.length > 0 || forecast.forecastDays.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-500">
              Daily spend — <span className="text-gray-400">actual</span> ·{" "}
              <span className="text-indigo-400">projected</span>
              <span className="text-gray-600 ml-2">(click a bar to annotate)</span>
            </div>
            {selectedDate && (
              <button
                onClick={closePanel}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                close ×
              </button>
            )}
          </div>
          <div className="flex items-end gap-0.5 h-24">
            {historicalSlice.map((p) => {
              const pct = (p.costUSD / maxCost) * 100;
              const isSelected = selectedDate === p.date;
              const hasAnnotation = annotatedDates.has(p.date);
              return (
                <div
                  key={p.date}
                  className="flex-1 relative group cursor-pointer"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  onClick={() => openDate(p.date)}
                  title={`${p.date}: ${fmt(p.costUSD)} — click to annotate`}
                >
                  <div
                    className={`w-full h-full rounded-t transition-colors ${
                      isSelected
                        ? "bg-indigo-500"
                        : "bg-gray-600 group-hover:bg-gray-500"
                    }`}
                  />
                  {hasAnnotation && (
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  )}
                </div>
              );
            })}
            {/* Separator */}
            <div className="w-px bg-indigo-700 self-stretch mx-0.5" />
            {forecast.forecastDays.map((d) => {
              const pct = (d.projectedUsd / maxCost) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 bg-indigo-800/60 border border-indigo-700/40 rounded-t"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${d.date} (projected): ${fmt(d.projectedUsd)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>{historicalSlice[0]?.date ?? ""}</span>
            <span className="text-indigo-700">← forecast →</span>
            <span>{forecast.forecastDays[forecast.forecastDays.length - 1]?.date ?? ""}</span>
          </div>
        </div>
      )}

      {/* Annotation panel */}
      {selectedDate && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-800/50">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Notes for {selectedDate}
          </div>

          {loadingAnnotations ? (
            <div className="text-xs text-gray-500">Loading…</div>
          ) : annotations.length === 0 ? (
            <div className="text-xs text-gray-600">No notes yet for this date.</div>
          ) : (
            <ul className="space-y-2">
              {annotations.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 group">
                  <div>
                    <p className="text-sm text-gray-300">{a.content}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNote(a.id)}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    title="Delete note"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add note */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNote()}
              placeholder="Add a note…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={saveNote}
              disabled={savingNote || !noteText.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-40"
            >
              {savingNote ? "…" : "Save"}
            </button>
          </div>
          {annotationError && (
            <p className="text-xs text-red-400">{annotationError}</p>
          )}
        </div>
      )}
    </div>
  );
}
