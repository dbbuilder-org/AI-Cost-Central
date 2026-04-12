"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STORAGE_KEY = "aicc:keys:openai";

export function ApiKeyForm() {
  const [value, setValue] = useState("");
  const [masked, setMasked] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setValue(stored);
      setMasked(true);
    }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, value.trim());
    setMasked(true);
    setStatus("idle");
  };

  const clear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setValue("");
    setMasked(false);
    setStatus("idle");
  };

  const test = async () => {
    const key = value.trim();
    if (!key) return;
    setTesting(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/openai/keys", { headers: { "x-openai-admin-key": key } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error);
      }
      const keys = await res.json();
      setStatus("ok");
      setErrorMsg(`Connected — ${keys.length} API key(s) found`);
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-gray-400 block mb-2">
          OpenAI Admin API Key
          <span className="ml-2 text-xs text-gray-600">(starts with sk-admin-...)</span>
        </label>
        <input
          type={masked ? "password" : "text"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setMasked(false); }}
          placeholder="sk-admin-..."
          className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={save} disabled={!value.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          Save Key
        </Button>
        <Button onClick={test} variant="outline" disabled={!value.trim() || testing}
          className="border-gray-700 text-gray-300 hover:bg-gray-800">
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        {masked && (
          <Button onClick={clear} variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-gray-800">
            Clear
          </Button>
        )}
      </div>

      {status === "ok" && (
        <Badge className="bg-green-900/60 text-green-300 border-green-800">{errorMsg}</Badge>
      )}
      {status === "error" && (
        <Badge className="bg-red-900/60 text-red-300 border-red-800">{errorMsg}</Badge>
      )}

      <p className="text-xs text-gray-600">
        Your key is stored only in your browser&apos;s localStorage. It is sent over HTTPS to our API proxy
        which forwards it to OpenAI — it is never logged or stored server-side.
      </p>
    </div>
  );
}
