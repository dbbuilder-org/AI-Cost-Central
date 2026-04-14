import React, { useState } from "react";
import type { Alert } from "../../types/index.js";

interface AlertItemProps {
  alert: Alert;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

function formatType(type: Alert["type"]): string {
  switch (type) {
    case "new_model": return "New Model";
    case "cost_spike": return "Cost Spike";
    case "volume_spike": return "Volume Spike";
    case "cost_drop": return "Cost Drop";
    case "new_key": return "New Key";
    default: return type;
  }
}

export default function AlertItem({ alert }: AlertItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="alert-item">
      <div
        className="alert-item-main"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
        }}
      >
        <span className={`severity-dot ${alert.severity}`} />

        <div className="alert-content">
          <span className="alert-type-badge">{formatType(alert.type)}</span>
          <div className="alert-subject">{alert.subject}</div>
          <div className="alert-message">{alert.message}</div>
        </div>

        <span className="alert-timestamp">{formatTimestamp(alert.detectedAt)}</span>
      </div>

      {expanded && (
        <div className="alert-expanded">
          <div className="alert-detail">{alert.detail}</div>
          {alert.investigateSteps.length > 0 && (
            <>
              <div className="investigate-title">Investigation steps:</div>
              {alert.investigateSteps.map((step, i) => (
                <div key={i} className="investigate-step">
                  {i + 1}. {step}
                </div>
              ))}
            </>
          )}
          <div style={{ fontSize: "10px", color: "var(--text2)", marginTop: "8px" }}>
            Change: {alert.changePct > 0 ? "+" : ""}{alert.changePct.toFixed(1)}% &nbsp;|&nbsp;
            Value: {alert.value.toFixed(2)} &nbsp;|&nbsp;
            Baseline: {alert.baseline.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
