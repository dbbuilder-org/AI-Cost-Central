"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ProjectRoutingConfig } from "@/lib/db/schema";

type QualityTier = "economy" | "balanced" | "quality" | "max";
type Provider = "openai" | "anthropic" | "google" | "groq" | "mistral";
type TaskType = "chat" | "coding" | "reasoning" | "extraction" | "classification" | "summarization" | "generation" | "embedding" | "vision";
type BudgetAction = "block" | "downgrade";

const QUALITY_TIERS: { value: QualityTier; label: string; desc: string }[] = [
  { value: "economy",  label: "Economy",  desc: "Cheapest model per task (e.g. gpt-4.1-nano)" },
  { value: "balanced", label: "Balanced", desc: "Best price/quality ratio (default)" },
  { value: "quality",  label: "Quality",  desc: "High accuracy; higher cost" },
  { value: "max",      label: "Max",      desc: "Best available model (frontier)" },
];

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "openai",    label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google",    label: "Google" },
  { value: "groq",      label: "Groq" },
  { value: "mistral",   label: "Mistral" },
];

const TASK_TYPES: TaskType[] = [
  "chat", "coding", "reasoning", "extraction", "classification",
  "summarization", "generation", "embedding", "vision",
];

interface Props {
  projectId: string;
  initial: ProjectRoutingConfig;
}

function Toggle({
  label, hint, checked, onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-gray-300">{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-indigo-600" : "bg-gray-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function ProjectRoutingForm({ projectId, initial }: Props) {
  const [tier, setTier] = useState<QualityTier>(initial.qualityTier ?? "balanced");
  const [autoRoute, setAutoRoute] = useState(initial.autoRoute ?? true);
  const [allowedProviders, setAllowedProviders] = useState<Provider[]>(
    (initial.allowedProviders as Provider[]) ?? [],
  );
  const [taskOverrides, setTaskOverrides] = useState<Partial<Record<TaskType, string>>>(
    (initial.taskOverrides as Partial<Record<TaskType, string>>) ?? {},
  );
  const [dailyBudget, setDailyBudget] = useState<string>(
    initial.dailyBudgetUsd != null ? String(initial.dailyBudgetUsd) : "",
  );
  const [monthlyBudget, setMonthlyBudget] = useState<string>(
    initial.monthlyBudgetUsd != null ? String(initial.monthlyBudgetUsd) : "",
  );
  const [budgetAction, setBudgetAction] = useState<BudgetAction>(initial.budgetAction ?? "downgrade");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleProvider = (p: Provider) => {
    setAllowedProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const setTaskOverride = (task: TaskType, model: string) => {
    setTaskOverrides((prev) => {
      const next = { ...prev };
      if (model) {
        next[task] = model;
      } else {
        delete next[task];
      }
      return next;
    });
  };

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const payload: ProjectRoutingConfig = {
      qualityTier: tier,
      autoRoute,
      allowedProviders: allowedProviders.length > 0 ? allowedProviders : undefined,
      taskOverrides: Object.keys(taskOverrides).length > 0 ? taskOverrides : undefined,
      dailyBudgetUsd: dailyBudget ? parseFloat(dailyBudget) : null,
      monthlyBudgetUsd: monthlyBudget ? parseFloat(monthlyBudget) : null,
      budgetAction,
    };

    try {
      const res = await fetch(`/api/org/projects/${projectId}/routing`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Quality Tier */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Quality Tier</CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Controls model selection when SmartRouter is deciding automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {QUALITY_TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  tier === t.value
                    ? "border-indigo-600 bg-indigo-900/20"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600"
                }`}
              >
                <div className="text-sm font-medium text-white">{t.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Routing toggle */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-5">
          <Toggle
            label="Smart Routing"
            hint="Automatically select the best model per request. When off, SmartRouter passes through to the requested model."
            checked={autoRoute}
            onChange={setAutoRoute}
          />
        </CardContent>
      </Card>

      {/* Allowed Providers */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Allowed Providers</CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Restrict routing to specific providers. Leave all unchecked to allow any provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => {
              const active = allowedProviders.includes(p.value) || allowedProviders.length === 0;
              const selected = allowedProviders.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => toggleProvider(p.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : allowedProviders.length === 0
                      ? "bg-gray-800 text-gray-300 border-gray-700"
                      : "bg-gray-900 text-gray-500 border-gray-700 opacity-50"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {allowedProviders.length === 0 && (
            <p className="text-xs text-gray-600 mt-2">All providers allowed (default)</p>
          )}
        </CardContent>
      </Card>

      {/* Task Overrides */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Task Model Overrides</CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Pin a specific model for a task type. Leave blank to let SmartRouter decide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {TASK_TYPES.map((task) => (
              <div key={task} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-24 shrink-0 capitalize">{task}</span>
                <input
                  type="text"
                  value={taskOverrides[task] ?? ""}
                  onChange={(e) => setTaskOverride(task, e.target.value)}
                  placeholder="e.g. gpt-4.1-nano"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Budget */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Spend Limits</CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Block or downgrade requests when this project exceeds its spend ceiling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Daily Limit (USD)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                placeholder="No limit"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Monthly Limit (USD)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                placeholder="No limit"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">When limit reached</label>
            <div className="flex gap-2">
              {(["block", "downgrade"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setBudgetAction(action)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                    budgetAction === action
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-800 text-gray-400 border-gray-700"
                  }`}
                >
                  {action === "block" ? "Block (429)" : "Downgrade to Economy"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save routing config"}
        </button>
        {saved && <span className="text-sm text-green-400">Config saved</span>}
      </div>
    </div>
  );
}
