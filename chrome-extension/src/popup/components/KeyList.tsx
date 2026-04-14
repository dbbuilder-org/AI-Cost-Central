import React, { useState } from "react";
import type { ApiKey, Settings } from "../../types/index.js";
import KeyCard from "./KeyCard.js";

type ProviderFilter = "all" | "openai" | "anthropic" | "google";
type SortBy = "cost" | "name" | "date";

interface KeyListProps {
  keys: ApiKey[];
  settings: Settings;
}

export default function KeyList({ keys, settings }: KeyListProps) {
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("cost");

  const filtered = keys.filter(
    (k) => providerFilter === "all" || k.provider === providerFilter
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "cost") {
      return (b.spend7d ?? 0) - (a.spend7d ?? 0);
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    // date
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const providers: { id: ProviderFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "openai", label: "OpenAI" },
    { id: "anthropic", label: "Anthropic" },
    { id: "google", label: "Google" },
  ];

  return (
    <>
      <div className="filter-bar">
        {providers.map((p) => (
          <button
            key={p.id}
            className={`filter-btn${providerFilter === p.id ? " active" : ""}`}
            onClick={() => setProviderFilter(p.id)}
          >
            {p.label}
          </button>
        ))}
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort keys by"
        >
          <option value="cost">Sort: Cost</option>
          <option value="name">Sort: Name</option>
          <option value="date">Sort: Date</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔑</span>
          <span>No keys found</span>
          {providerFilter !== "all" && (
            <span style={{ fontSize: "11px" }}>
              Try switching provider filter to "All"
            </span>
          )}
        </div>
      ) : (
        sorted.map((key) => (
          <KeyCard key={key.id} apiKey={key} settings={settings} />
        ))
      )}
    </>
  );
}
