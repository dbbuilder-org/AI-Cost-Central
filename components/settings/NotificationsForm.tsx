"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { NotificationConfig } from "@/app/api/org/notifications/route";

interface Props {
  initial: NotificationConfig;
}

const SEVERITY_OPTIONS = [
  { value: "all",                   label: "All (info, warning, critical)" },
  { value: "warning_and_critical",  label: "Warning + Critical" },
  { value: "critical_only",         label: "Critical only" },
] as const;

function InputField({
  label, hint, value, onChange, type = "text", placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );
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

export function NotificationsForm({ initial }: Props) {
  const [form, setForm] = useState<NotificationConfig>({
    slackWebhookUrl:   initial.slackWebhookUrl  ?? "",
    alertEmails:       initial.alertEmails       ?? [],
    dailyBriefEnabled: initial.dailyBriefEnabled ?? false,
    weeklyBriefEnabled: initial.weeklyBriefEnabled ?? false,
    minSeverity:       initial.minSeverity       ?? "all",
    spikeZScore:       initial.spikeZScore       ?? 2.5,
    spikeMinPct:       initial.spikeMinPct       ?? 50,
  });

  const [emailInput, setEmailInput] = useState((initial.alertEmails ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = <K extends keyof NotificationConfig>(key: K) =>
    (value: NotificationConfig[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    // Parse emails from textarea
    const emails = emailInput
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);

    const payload: NotificationConfig = { ...form, alertEmails: emails };

    try {
      const res = await fetch("/api/org/notifications", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
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
      {/* Slack */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            Slack
            <Badge className="bg-green-900 text-green-300 text-xs">Recommended</Badge>
          </CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Send anomaly alerts to a Slack channel via an incoming webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InputField
            label="Incoming Webhook URL"
            hint="Create one at api.slack.com/apps → Incoming Webhooks"
            value={form.slackWebhookUrl ?? ""}
            onChange={field("slackWebhookUrl")}
            placeholder="https://hooks.slack.com/services/..."
          />
        </CardContent>
      </Card>

      {/* Email */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Email</CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Receive anomaly and spend brief digests by email (via Resend).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Alert Recipients</label>
            <p className="text-xs text-gray-500">One email per line, or comma-separated</p>
            <textarea
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              rows={3}
              placeholder="ops@yourcompany.com, cto@yourcompany.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="space-y-3">
            <Toggle
              label="Daily Spend Brief"
              hint="Morning email with yesterday's spend breakdown"
              checked={form.dailyBriefEnabled ?? false}
              onChange={field("dailyBriefEnabled")}
            />
            <Toggle
              label="Weekly Spend Brief"
              hint="Monday summary comparing last 7 days vs prior week"
              checked={form.weeklyBriefEnabled ?? false}
              onChange={field("weeklyBriefEnabled")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Alert Thresholds</CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Tune when anomaly alerts are triggered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Min severity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Minimum Severity</label>
            <select
              value={form.minSeverity ?? "all"}
              onChange={(e) => field("minSeverity")(e.target.value as NotificationConfig["minSeverity"])}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Z-score threshold */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">
              Cost Spike Z-Score Threshold
            </label>
            <p className="text-xs text-gray-500">
              Fire when daily cost is this many standard deviations above baseline. Default: 2.5
            </p>
            <input
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={form.spikeZScore ?? 2.5}
              onChange={(e) => field("spikeZScore")(parseFloat(e.target.value))}
              className="w-32 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Min % increase */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">
              Minimum % Increase to Alert
            </label>
            <p className="text-xs text-gray-500">
              Suppress alerts when the % increase is below this value, even if z-score is high. Default: 50
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={500}
                step={5}
                value={form.spikeMinPct ?? 50}
                onChange={(e) => field("spikeMinPct")(parseInt(e.target.value, 10))}
                className="w-24 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-gray-400 text-sm">%</span>
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
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && (
          <span className="text-sm text-green-400">Settings saved</span>
        )}
      </div>
    </div>
  );
}
