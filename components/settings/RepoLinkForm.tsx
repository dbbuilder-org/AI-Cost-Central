"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RepoLink {
  id: string;
  apiKeyId: string;
  apiKeyName: string;
  githubOwner: string;
  githubRepo: string;
  pathFilter: string;
  displayName: string;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  project: string;
}

const STORAGE_KEY = "aicc:keys:openai";

export function RepoLinkForm() {
  const [links, setLinks] = useState<RepoLink[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanningId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<Record<string, { hits: number; files: string[] }>>({});

  const [form, setForm] = useState({
    apiKeyId: "",
    githubOwner: "",
    githubRepo: "",
    pathFilter: "",
    displayName: "",
  });

  useEffect(() => {
    loadLinks();
    loadApiKeys();
  }, []);

  async function loadLinks() {
    const res = await fetch("/api/repo-links");
    if (res.ok) setLinks(await res.json());
  }

  async function loadApiKeys() {
    const key = localStorage.getItem(STORAGE_KEY);
    const headers: HeadersInit = key ? { "x-openai-admin-key": key } : {};
    const res = await fetch("/api/openai/keys", { headers });
    if (res.ok) setApiKeys(await res.json());
  }

  async function save() {
    if (!form.apiKeyId || !form.githubOwner || !form.githubRepo) return;
    setSaving(true);
    const selectedKey = apiKeys.find((k) => k.id === form.apiKeyId);
    await fetch("/api/repo-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        apiKeyName: selectedKey ? `${selectedKey.name} (${selectedKey.project})` : form.apiKeyId,
        displayName: form.displayName || `${form.githubOwner}/${form.githubRepo}`,
      }),
    });
    await loadLinks();
    setAdding(false);
    setForm({ apiKeyId: "", githubOwner: "", githubRepo: "", pathFilter: "", displayName: "" });
    setSaving(false);
  }

  async function remove(id: string) {
    await fetch("/api/repo-links", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    await loadLinks();
  }

  async function scan(link: RepoLink) {
    setScanningId(link.id);
    const res = await fetch("/api/github/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: link.githubOwner, repo: link.githubRepo, pathFilter: link.pathFilter }),
    });
    if (res.ok) {
      const data = await res.json();
      const files = Array.from(new Set((data.hits ?? []).map((h: { file: string }) => h.file))) as string[];
      setScanResult((prev) => ({ ...prev, [link.id]: { hits: data.hits?.length ?? 0, files } }));
    }
    setScanningId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            Link API keys to GitHub repos so AI Analysis can name specific files and functions when making recommendations.
          </p>
          {!process.env.NEXT_PUBLIC_GITHUB_CONFIGURED && (
            <p className="text-xs text-amber-400 mt-1">
              Set <code className="bg-gray-800 px-1 rounded">GITHUB_TOKEN</code> in Vercel environment to enable repo scanning.
            </p>
          )}
        </div>
        <Button
          onClick={() => setAdding(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          disabled={adding}
        >
          + Link Repo
        </Button>
      </div>

      {/* Add form */}
      {adding && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">Link a GitHub Repo to an API Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">API Key</label>
              <select
                value={form.apiKeyId}
                onChange={(e) => setForm((f) => ({ ...f, apiKeyId: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
              >
                <option value="">Select API key…</option>
                {apiKeys.map((k) => (
                  <option key={k.id} value={k.id}>{k.name} ({k.project})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">GitHub Owner</label>
                <input
                  value={form.githubOwner}
                  onChange={(e) => setForm((f) => ({ ...f, githubOwner: e.target.value }))}
                  placeholder="dbbuilder-org"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Repo Name</label>
                <input
                  value={form.githubRepo}
                  onChange={(e) => setForm((f) => ({ ...f, githubRepo: e.target.value }))}
                  placeholder="UpApply"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Path filter <span className="text-gray-600">(optional — narrow to a subfolder)</span></label>
              <input
                value={form.pathFilter}
                onChange={(e) => setForm((f) => ({ ...f, pathFilter: e.target.value }))}
                placeholder="api/app/services"
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !form.apiKeyId || !form.githubOwner || !form.githubRepo}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                {saving ? "Saving…" : "Save Link"}
              </Button>
              <Button onClick={() => setAdding(false)} variant="ghost" className="text-gray-400 text-xs">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing links */}
      {links.length === 0 && !adding && (
        <p className="text-sm text-gray-600 py-4 text-center">No repo links yet.</p>
      )}
      {links.map((link) => {
        const result = scanResult[link.id];
        return (
          <Card key={link.id} className="bg-gray-900 border-gray-800">
            <CardContent className="py-3 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{link.apiKeyName}</span>
                  <span className="text-gray-600">→</span>
                  <a
                    href={`https://github.com/${link.githubOwner}/${link.githubRepo}${link.pathFilter ? `/tree/main/${link.pathFilter}` : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline text-sm font-mono"
                  >
                    {link.githubOwner}/{link.githubRepo}
                    {link.pathFilter && `/${link.pathFilter}`}
                  </a>
                </div>
                {result && (
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p className="text-green-400">{result.hits} model call sites found</p>
                    {result.files.slice(0, 4).map((f) => (
                      <p key={f} className="font-mono truncate">• {f}</p>
                    ))}
                    {result.files.length > 4 && <p className="text-gray-600">+{result.files.length - 4} more files</p>}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  onClick={() => scan(link)}
                  disabled={scanning === link.id}
                  variant="outline"
                  className="text-xs border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  {scanning === link.id ? "Scanning…" : "Scan"}
                </Button>
                <Button onClick={() => remove(link.id)} variant="ghost" className="text-xs text-red-400 hover:text-red-300">
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
