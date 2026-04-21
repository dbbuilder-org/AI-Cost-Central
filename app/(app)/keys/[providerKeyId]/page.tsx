"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Github,
  Plus,
  X,
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface KeyDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  blobUrl: string;
  uploadedAt: string;
}

interface KeyContext {
  providerKeyId: string;
  provider: string;
  displayName: string | null;
  purpose: string | null;
  githubRepos: string[];
  updatedAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KeyDetailPage() {
  const { providerKeyId } = useParams<{ providerKeyId: string }>();
  const router = useRouter();
  const keyId = decodeURIComponent(providerKeyId);

  // Data state
  const [context, setContext] = useState<KeyContext | null>(null);
  const [documents, setDocuments] = useState<KeyDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [githubRepos, setGithubRepos] = useState<string[]>([]);
  const [repoInput, setRepoInput] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete doc state
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/key-contexts/${encodeURIComponent(keyId)}`);
      const data = await res.json() as { context: KeyContext | null; documents: KeyDocument[] };
      if (data.context) {
        setContext(data.context);
        setDisplayName(data.context.displayName ?? "");
        setPurpose(data.context.purpose ?? "");
        setGithubRepos(data.context.githubRepos ?? []);
      }
      setDocuments(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, [keyId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/org/key-contexts/${encodeURIComponent(keyId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: context?.provider ?? "openai",
          displayName: displayName || null,
          purpose: purpose || null,
          githubRepos,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const addRepo = () => {
    const trimmed = repoInput.trim();
    if (!trimmed || githubRepos.includes(trimmed)) return;
    setGithubRepos([...githubRepos, trimmed]);
    setRepoInput("");
  };

  const removeRepo = (repo: string) => {
    setGithubRepos(githubRepos.filter((r) => r !== repo));
  };

  const handleRepoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addRepo(); }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/org/key-contexts/${encodeURIComponent(keyId)}/documents`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json() as { document?: KeyDocument; error?: string };
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
      } else if (data.document) {
        setDocuments((prev) => [...prev, data.document!]);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const deleteDoc = async (docId: string) => {
    setDeletingDocId(docId);
    try {
      await fetch(
        `/api/org/key-contexts/${encodeURIComponent(keyId)}/documents/${docId}`,
        { method: "DELETE" }
      );
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } finally {
      setDeletingDocId(null);
    }
  };

  const keyLabel = context?.displayName ?? displayName || keyId;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-900 animate-pulse border border-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back + header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/keys"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Key Intelligence
          </Link>
          <h1 className="text-xl font-bold text-white">{keyLabel}</h1>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{keyId}</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="space-y-6">
        {/* Basic info */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Key Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. UpApply Production"
                className="w-full px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Purpose
                <span className="ml-1 text-gray-600 font-normal">— used by anomaly analysis</span>
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Describe what this API key is used for, which team owns it, and what kind of usage patterns are expected…"
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
              <p className="mt-1.5 text-xs text-gray-600">
                The more context you provide, the better anomaly explanations become. Include expected models, typical request volume, billing owner, etc.
              </p>
            </div>
          </div>
        </section>

        {/* GitHub repos */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-1">GitHub Repositories</h2>
          <p className="text-xs text-gray-500 mb-4">
            Link repos that use this key — enables code-level anomaly context.
          </p>

          {/* Repo list */}
          {githubRepos.length > 0 && (
            <div className="space-y-2 mb-3">
              {githubRepos.map((repo) => (
                <div
                  key={repo}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800"
                >
                  <Github className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-200 flex-1 truncate">{repo}</span>
                  <a
                    href={repo.startsWith("http") ? repo : `https://github.com/${repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => removeRepo(repo)}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add repo input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={handleRepoKeyDown}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="flex-1 px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={addRepo}
              disabled={!repoInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </section>

        {/* Documents */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-1">Reference Documents</h2>
          <p className="text-xs text-gray-500 mb-4">
            Attach runbooks, architecture docs, or any context that explains expected behavior for this key.
            Accepted: PDF, TXT, MD, DOC, DOCX (max 10 MB).
          </p>

          {/* Document list */}
          {documents.length > 0 && (
            <div className="space-y-2 mb-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-950 border border-gray-800"
                >
                  <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{doc.fileName}</p>
                    <p className="text-xs text-gray-600">{formatBytes(doc.fileSize)}</p>
                  </div>
                  <a
                    href={doc.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => deleteDoc(doc.id)}
                    disabled={deletingDocId === doc.id}
                    className="text-gray-600 hover:text-red-400 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {deletingDocId === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-lg border border-dashed border-gray-700 hover:border-gray-500 bg-gray-950 cursor-pointer transition-colors group"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            ) : (
              <Upload className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" />
            )}
            <p className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors text-center">
              {uploading ? "Uploading…" : "Drop a file here or click to browse"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.doc,.docx,text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
            />
          </div>

          {uploadError && (
            <p className="mt-2 text-xs text-red-400">{uploadError}</p>
          )}
        </section>
      </div>
    </div>
  );
}
