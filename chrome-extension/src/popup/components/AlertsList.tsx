import React from "react";
import type { Alert } from "../../types/index.js";
import AlertItem from "./AlertItem.js";

interface AlertsListProps {
  alerts: Alert[];
}

export default function AlertsList({ alerts }: AlertsListProps) {
  if (alerts.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">✅</span>
        <span>No alerts</span>
        <span style={{ fontSize: "11px" }}>All systems normal</span>
      </div>
    );
  }

  // Sort: critical first, then warning, then info
  const sorted = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <>
      {sorted.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}
    </>
  );
}
