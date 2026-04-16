"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Panel for managing provider API key IDs that should be excluded from
 * the dashboard (e.g. internal test keys, Claude Code sessions).
 * Shown on the Settings → API Keys page.
 */
export function ExcludedKeysPanel() {
  const [excludedKeyIds, setExcludedKeyIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org/excluded-keys")
      .then((r) => r.json())
      .then((d: { excludedKeyIds?: string[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setExcludedKeyIds(d.excludedKeyIds ?? []);
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save(updated: string[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/excluded-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedKeyIds: updated }),
      });
      const d = await res.json() as { excludedKeyIds?: string[]; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? "Save failed");
      } else {
        setExcludedKeyIds(d.excludedKeyIds ?? updated);
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  function addKey() {
    const trimmed = input.trim();
    if (!trimmed || excludedKeyIds.includes(trimmed)) {
      setInput("");
      return;
    }
    const updated = [...excludedKeyIds, trimmed];
    setInput("");
    save(updated);
  }

  function removeKey(keyId: string) {
    save(excludedKeyIds.filter((k) => k !== keyId));
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white text-sm">Excluded API Key IDs</CardTitle>
        <CardDescription className="text-gray-400 text-xs">
          Key IDs listed here are filtered out of the dashboard. Use this to hide internal test keys, CI keys, or Claude Code sessions. Enter the provider's key ID (not the secret value).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {/* Current excluded list */}
        {loading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : excludedKeyIds.length === 0 ? (
          <p className="text-xs text-gray-600">No keys excluded — all usage is visible in the dashboard.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {excludedKeyIds.map((keyId) => (
              <Badge
                key={keyId}
                className="bg-gray-800 text-gray-300 border border-gray-700 font-mono text-xs gap-1.5 pr-1"
              >
                {keyId}
                <button
                  onClick={() => removeKey(keyId)}
                  disabled={saving}
                  className="ml-1 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  aria-label={`Remove ${keyId}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Add new key */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKey()}
            placeholder="e.g. apikey_01KoucGYD… or key-abc123"
            className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            disabled={saving}
          />
          <button
            onClick={addKey}
            disabled={saving || !input.trim()}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : "Exclude"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
