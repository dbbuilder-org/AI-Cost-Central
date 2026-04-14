"use client";

import { useState } from "react";
import { formatDistanceToNow } from "@/lib/utils";

interface Division {
  id: string;
  name: string;
  description: string | null;
  budgetUsd: string | null;
  createdAt: Date;
}

export function DivisionsClient({
  initialDivisions,
  limitReached,
}: {
  initialDivisions: Division[];
  limitReached: boolean;
}) {
  const [divisions, setDivisions] = useState(initialDivisions);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", budgetUsd: "" });
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          budgetUsd: form.budgetUsd ? parseFloat(form.budgetUsd) : undefined,
        }),
      });
      const data = await res.json() as { division?: Division; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create division");
        return;
      }
      if (data.division) {
        setDivisions((prev) => [...prev, data.division!]);
        setShowForm(false);
        setForm({ name: "", description: "", budgetUsd: "" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this division?")) return;
    await fetch(`/api/org/divisions/${id}`, { method: "DELETE" });
    setDivisions((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{divisions.length} division{divisions.length !== 1 ? "s" : ""}</p>
        {!limitReached ? (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Division
          </button>
        ) : (
          <a href="/billing" className="text-xs text-amber-400 hover:underline">
            Upgrade to add more divisions →
          </a>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-semibold text-sm">New Division</h3>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Name</label>
            <input
              required
              type="text"
              placeholder="e.g. Platform Team"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Description</label>
            <input
              type="text"
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Monthly Budget (USD, optional)</label>
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
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-40"
            >
              {saving ? "Creating…" : "Create Division"}
            </button>
          </div>
        </form>
      )}

      {divisions.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-gray-800 p-12 text-center">
          <p className="text-gray-500 text-sm">No divisions yet.</p>
          <p className="text-gray-600 text-xs mt-1">Divisions help you track spend by team.</p>
        </div>
      )}

      <div className="space-y-3">
        {divisions.map((div) => (
          <div key={div.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <div>
              <span className="text-white text-sm font-medium">{div.name}</span>
              {div.description && <p className="text-xs text-gray-400 mt-0.5">{div.description}</p>}
              <p className="text-xs text-gray-600 mt-0.5">
                Created {formatDistanceToNow(div.createdAt)}
                {div.budgetUsd && ` · Budget: $${parseFloat(div.budgetUsd).toFixed(2)}/mo`}
              </p>
            </div>
            <button
              onClick={() => handleDelete(div.id)}
              className="text-xs text-red-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
