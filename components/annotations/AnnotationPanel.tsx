"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "@/lib/utils";

interface Annotation {
  id: string;
  content: string;
  tags: string[] | null;
  createdAt: string;
}

interface AnnotationPanelProps {
  entityType: string;
  entityId: string;
}

export function AnnotationPanel({ entityType, entityId }: AnnotationPanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/org/annotations?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((d: { annotations?: Annotation[] }) => setAnnotations(d.annotations ?? []))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/org/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, content }),
      });
      const data = await res.json() as { annotation?: Annotation };
      if (data.annotation) {
        setAnnotations((prev) => [data.annotation!, ...prev]);
        setContent("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</h3>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="Add a note…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
        >
          {saving ? "…" : "Add"}
        </button>
      </form>

      {loading && <p className="text-xs text-gray-600">Loading…</p>}

      <div className="space-y-2">
        {annotations.map((a) => (
          <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <p className="text-sm text-gray-300">{a.content}</p>
            <p className="text-xs text-gray-600 mt-1">{formatDistanceToNow(new Date(a.createdAt))}</p>
          </div>
        ))}
        {!loading && annotations.length === 0 && (
          <p className="text-xs text-gray-600">No notes yet.</p>
        )}
      </div>
    </div>
  );
}
