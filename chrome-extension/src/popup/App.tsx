import React, { useEffect, useState } from "react";
import type { ApiKey, Alert, Settings } from "../types/index.js";
import { getState, updateSettings, storeKeys, storeAlerts } from "../lib/storage.js";
import { fetchKeys, fetchAlerts } from "../lib/api.js";
import Header from "./components/Header.js";
import KeyList from "./components/KeyList.js";
import AlertsList from "./components/AlertsList.js";
import SettingsPanel from "./components/SettingsPanel.js";

type TabId = "keys" | "alerts" | "settings";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("keys");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<Settings>({
    apiBaseUrl: "https://ai-cost-central.vercel.app",
    namingTemplate: "{project}-{provider}-{YYYY-MM}",
    renewalWarnDays: 30,
    alertEmailTo: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unreadAlertCount = alerts.filter(
    (a) => a.severity === "critical" || a.severity === "warning"
  ).length;

  async function loadData(forceRefresh = false) {
    setLoading(true);
    setError(null);
    try {
      const state = await getState();
      setSettings(state.settings);

      const now = Date.now();
      const lastFetch = state.lastFetch ? new Date(state.lastFetch).getTime() : 0;
      const stale = now - lastFetch > REFRESH_INTERVAL_MS;

      if (forceRefresh || stale) {
        const [freshKeys, freshAlerts] = await Promise.all([
          fetchKeys(state.settings.apiBaseUrl),
          fetchAlerts(state.settings.apiBaseUrl),
        ]);
        await storeKeys(freshKeys);
        await storeAlerts(freshAlerts);
        setKeys(freshKeys);
        setAlerts(freshAlerts);
      } else {
        setKeys(state.recentKeys);
        setAlerts(state.recentAlerts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function handleRefresh() {
    void loadData(true);
  }

  function handleSettingsUpdate(updated: Settings) {
    setSettings(updated);
    void updateSettings(updated);
  }

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
  }

  return (
    <div className="app">
      <Header
        onRefresh={handleRefresh}
        onSettings={() => handleTabChange("settings")}
        alertCount={unreadAlertCount}
      />

      <div className="tabs">
        <button
          className={`tab${activeTab === "keys" ? " active" : ""}`}
          onClick={() => handleTabChange("keys")}
        >
          Keys {keys.length > 0 && <span className="tab-count">({keys.length})</span>}
        </button>
        <button
          className={`tab${activeTab === "alerts" ? " active" : ""}`}
          onClick={() => handleTabChange("alerts")}
        >
          Alerts
          {unreadAlertCount > 0 && (
            <span className="tab-badge">{unreadAlertCount}</span>
          )}
        </button>
        <button
          className={`tab${activeTab === "settings" ? " active" : ""}`}
          onClick={() => handleTabChange("settings")}
        >
          Settings
        </button>
      </div>

      <div className="content">
        {loading ? (
          <div className="state-center">
            <span className="state-icon">⏳</span>
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div className="state-center">
            <span className="state-icon">⚠️</span>
            <span>{error}</span>
          </div>
        ) : (
          <>
            {activeTab === "keys" && (
              <KeyList
                keys={keys}
                settings={settings}
              />
            )}
            {activeTab === "alerts" && <AlertsList alerts={alerts} />}
            {activeTab === "settings" && (
              <SettingsPanel
                settings={settings}
                onSave={handleSettingsUpdate}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
