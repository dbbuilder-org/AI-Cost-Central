import React, { useState } from "react";
import type { ApiKey, Settings } from "../../types/index.js";
import { validateKeyName } from "../../lib/naming.js";
import { setKeyMetadata } from "../../lib/storage.js";
import { isKeyNearRenewal } from "../../lib/detector.js";

interface KeyCardProps {
  apiKey: ApiKey;
  settings: Settings;
}

function formatSpend(amount: number | undefined): string {
  if (amount === undefined || amount === null) return "--";
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

export default function KeyCard({ apiKey, settings }: KeyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [renewalDate, setRenewalDate] = useState("");
  const [saved, setSaved] = useState(false);

  const validation = validateKeyName(apiKey.name, settings.namingTemplate);
  const isNear = renewalDate
    ? isKeyNearRenewal(renewalDate, settings.renewalWarnDays)
    : false;
  const isOverdue =
    renewalDate ? isKeyNearRenewal(renewalDate, 0) : false;

  async function handleSave() {
    await setKeyMetadata(apiKey.id, { renewalDate });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function getRenewalInputClass(): string {
    if (isOverdue) return "renewal-input overdue";
    if (isNear) return "renewal-input near";
    return "renewal-input";
  }

  return (
    <div className="key-card">
      <div
        className="key-card-main"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
        }}
      >
        <span className={`provider-badge ${apiKey.provider}`}>
          {apiKey.provider === "openai"
            ? "OAI"
            : apiKey.provider === "anthropic"
            ? "ANT"
            : "GGL"}
        </span>

        <span className="key-name" title={apiKey.name}>
          {apiKey.name}
        </span>

        {apiKey.isNew && <span className="new-badge">NEW</span>}

        <span
          className={`naming-icon ${validation.valid ? "valid" : "invalid"}`}
          title={
            validation.valid
              ? "Naming convention OK"
              : validation.violations.join("; ")
          }
        >
          {validation.valid ? "✓" : "✗"}
        </span>

        <span className="key-spend">{formatSpend(apiKey.spend7d)}</span>
        <span className="key-last-used">{formatDate(apiKey.lastSeen)}</span>
      </div>

      {expanded && (
        <div className="key-card-expanded">
          {!validation.valid && validation.violations.length > 0 && (
            <div className="key-violations">
              {validation.violations.map((v, i) => (
                <div key={i} className="violation-item">
                  ✗ {v}
                </div>
              ))}
            </div>
          )}

          <div className="key-card-expanded-row">
            <span className="key-label">Renewal date:</span>
            <input
              type="date"
              className={getRenewalInputClass()}
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
            />
          </div>

          {isOverdue && (
            <div style={{ fontSize: "11px", color: "var(--red)", marginBottom: "6px" }}>
              Past due
            </div>
          )}
          {!isOverdue && isNear && (
            <div style={{ fontSize: "11px", color: "var(--yellow)", marginBottom: "6px" }}>
              Renewal coming soon
            </div>
          )}

          <div className="key-card-expanded-row">
            <span className="key-label">Score:</span>
            <span style={{ fontSize: "12px", color: "var(--text2)" }}>
              {validation.score}/100
            </span>
          </div>

          {apiKey.hint && (
            <div className="key-card-expanded-row">
              <span className="key-label">Hint:</span>
              <span style={{ fontSize: "11px", color: "var(--text2)", fontFamily: "monospace" }}>
                {apiKey.hint}
              </span>
            </div>
          )}

          <div className="key-card-expanded-row" style={{ marginTop: "6px" }}>
            <button className="save-btn" onClick={handleSave}>
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
