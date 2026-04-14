import React, { useState } from "react";
import type { Settings } from "../../types/index.js";

interface SettingsPanelProps {
  settings: Settings;
  onSave: (updated: Settings) => void;
}

function generateExample(template: string): string {
  return template
    .replace(/\{project\}/g, "upapply")
    .replace(/\{provider\}/g, "anthropic")
    .replace(/\{YYYY-MM\}/g, "2026-04")
    .replace(/\{YYYY\}/g, "2026")
    .replace(/\{MM\}/g, "04")
    .replace(/\{env\}/g, "prod")
    .replace(/\{team\}/g, "eng");
}

export default function SettingsPanel({ settings, onSave }: SettingsPanelProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [namingTemplate, setNamingTemplate] = useState(settings.namingTemplate);
  const [renewalWarnDays, setRenewalWarnDays] = useState(settings.renewalWarnDays);
  const [alertEmailTo, setAlertEmailTo] = useState(settings.alertEmailTo);
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      apiBaseUrl: apiBaseUrl.trim(),
      namingTemplate: namingTemplate.trim(),
      renewalWarnDays: Math.max(1, Math.min(365, renewalWarnDays)),
      alertEmailTo: alertEmailTo.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form className="settings-panel" onSubmit={handleSave}>
      <div className="settings-group">
        <label className="settings-label" htmlFor="api-base-url">
          API Base URL
        </label>
        <input
          id="api-base-url"
          type="url"
          className="settings-input"
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
          placeholder="https://ai-cost-central.vercel.app"
        />
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="naming-template">
          Naming Template
        </label>
        <input
          id="naming-template"
          type="text"
          className="settings-input"
          value={namingTemplate}
          onChange={(e) => setNamingTemplate(e.target.value)}
          placeholder="{project}-{provider}-{YYYY-MM}"
        />
        <div className="settings-hint">
          Tokens: {"{project}"}, {"{provider}"}, {"{YYYY-MM}"}, {"{env}"}, {"{team}"}
        </div>
        <div className="settings-hint" style={{ marginTop: "2px" }}>
          Example: <strong style={{ color: "var(--text)" }}>{generateExample(namingTemplate)}</strong>
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="renewal-warn-days">
          Renewal Warning (days)
        </label>
        <input
          id="renewal-warn-days"
          type="number"
          className="settings-input"
          value={renewalWarnDays}
          onChange={(e) => setRenewalWarnDays(parseInt(e.target.value, 10) || 30)}
          min={1}
          max={365}
        />
        <div className="settings-hint">
          Warn when renewal is within this many days
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label" htmlFor="alert-email">
          Alert Email
        </label>
        <input
          id="alert-email"
          type="email"
          className="settings-input"
          value={alertEmailTo}
          onChange={(e) => setAlertEmailTo(e.target.value)}
          placeholder="you@example.com"
        />
        <div className="settings-hint">
          Email for critical alert notifications (optional)
        </div>
      </div>

      <button type="submit" className="settings-save-btn">
        Save Settings
      </button>
      {saved && <div className="settings-saved">Settings saved!</div>}
    </form>
  );
}
