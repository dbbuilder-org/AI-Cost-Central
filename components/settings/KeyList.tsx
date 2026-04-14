"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AddKeyDialog } from "./AddKeyDialog";
import { formatDistanceToNow } from "@/lib/utils";

interface KeyRow {
  id: string;
  provider: string;
  displayName: string;
  hint: string | null;
  description: string | null;
  tags: string[] | null;
  budgetUsd: string | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-green-900/40 text-green-300 border-green-800",
  anthropic: "bg-orange-900/40 text-orange-300 border-orange-800",
  google: "bg-blue-900/40 text-blue-300 border-blue-800",
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export function KeyList({
  initialKeys,
  atLimit,
}: {
  initialKeys: KeyRow[];
  atLimit: boolean;
}) {
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdded = (key: KeyRow) => {
    setKeys((prev) => [key, ...prev]);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/org/keys/${id}`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id
            ? { ...k, lastTestOk: data.ok, lastTestedAt: new Date() }
            : k
        )
      );
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this API key? This action cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/org/keys/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{keys.length} key{keys.length !== 1 ? "s" : ""} stored</p>
        <AddKeyDialog onAdded={handleAdded} disabled={atLimit} />
      </div>

      {keys.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-800 p-12 text-center">
          <p className="text-gray-500 text-sm">No API keys yet.</p>
          <p className="text-gray-600 text-xs mt-1">Add your first key to start tracking AI spend.</p>
        </div>
      )}

      <div className="space-y-3">
        {keys.map((key) => (
          <div
            key={key.id}
            className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-start justify-between gap-4"
          >
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs border ${PROVIDER_COLORS[key.provider] ?? "bg-gray-800 text-gray-300 border-gray-700"}`}>
                  {PROVIDER_LABELS[key.provider] ?? key.provider}
                </Badge>
                <span className="text-sm font-medium text-white truncate">{key.displayName}</span>
                {key.hint && (
                  <span className="text-xs font-mono text-gray-500">···{key.hint}</span>
                )}
              </div>

              {key.description && (
                <p className="text-xs text-gray-400">{key.description}</p>
              )}

              {key.tags && key.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {key.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Added {formatDistanceToNow(key.createdAt)}</span>
                {key.lastTestedAt && (
                  <span className={key.lastTestOk ? "text-green-400" : "text-red-400"}>
                    {key.lastTestOk ? "✓ Valid" : "✗ Invalid"} · tested {formatDistanceToNow(key.lastTestedAt)}
                  </span>
                )}
                {key.budgetUsd && (
                  <span className="text-yellow-500">Budget: ${parseFloat(key.budgetUsd).toFixed(2)}/mo</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleTest(key.id)}
                disabled={testingId === key.id}
                className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-40"
              >
                {testingId === key.id ? "Testing…" : "Test"}
              </button>
              <button
                onClick={() => handleDelete(key.id)}
                disabled={deletingId === key.id}
                className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-40"
              >
                {deletingId === key.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
