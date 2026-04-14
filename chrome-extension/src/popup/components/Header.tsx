import React from "react";

interface HeaderProps {
  onRefresh: () => void;
  onSettings: () => void;
  alertCount: number;
}

export default function Header({ onRefresh, onSettings, alertCount }: HeaderProps) {
  return (
    <div className="header">
      <span className="header-title">AI Key Manager</span>
      <div className="header-actions">
        {alertCount > 0 && (
          <span className="alert-badge">{alertCount}</span>
        )}
        <button
          className="icon-btn"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh"
        >
          ↻
        </button>
        <button
          className="icon-btn"
          onClick={onSettings}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
