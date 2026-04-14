"use client";

import { useState } from "react";

interface AddKeyDialogProps {
  onAdded: (key: {
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
  }) => void;
  disabled?: boolean;
}

export function AddKeyDialog({ onAdded, disabled }: AddKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    provider: "openai",
    displayName: "",
    plaintext: "",
    description: "",
    tags: "",
    budgetUsd: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          displayName: form.displayName,
          plaintext: form.plaintext,
          description: form.description || undefined,
          tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          budgetUsd: form.budgetUsd ? parseFloat(form.budgetUsd) : undefined,
        }),
      });
      const data = await res.json() as { key?: { id: string; provider: string; displayName: string; hint: string; createdAt: string }; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save key");
        return;
      }
      if (data.key) {
        onAdded({
          ...data.key,
          hint: data.key.hint ?? null,
          description: form.description || null,
          tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
          budgetUsd: form.budgetUsd || null,
          lastTestedAt: null,
          lastTestOk: null,
          createdAt: new Date(data.key.createdAt),
        });
        setOpen(false);
        setForm({ provider: "openai", displayName: "", plaintext: "", description: "", tags: "", budgetUsd: "" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add Key
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add API Key</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Display Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Production Admin Key"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  {form.provider === "google" ? "Service Account JSON" : "API Key"}
                </label>
                <textarea
                  required
                  rows={form.provider === "google" ? 4 : 2}
                  placeholder={form.provider === "google" ? '{"type":"service_account",...}' : "sk-admin-..."}
                  value={form.plaintext}
                  onChange={(e) => setForm((f) => ({ ...f, plaintext: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none"
                />
                <p className="text-xs text-gray-600 mt-1">Encrypted with AES-256-GCM before storage. Never stored in plaintext.</p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Used by production services"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Tags (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="production, team-a"
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Monthly Budget (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.budgetUsd}
                    onChange={(e) => setForm((f) => ({ ...f, budgetUsd: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
