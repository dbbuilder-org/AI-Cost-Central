// Chrome MV3 Service Worker — NO React imports
import { getState, markKeysSeen, storeAlerts, storeKeys } from "../lib/storage.js";
import { fetchKeys, fetchAlerts } from "../lib/api.js";
import { detectNewAlerts } from "../lib/detector.js";

const ALARM_NAME = "daily-check";
const ALARM_PERIOD_MINUTES = 1440; // 24 hours

async function runCheck(): Promise<void> {
  try {
    const state = await getState();
    const { apiBaseUrl } = state.settings;

    const [keys, alerts] = await Promise.all([
      fetchKeys(apiBaseUrl),
      fetchAlerts(apiBaseUrl),
    ]);

    // Store fetched data
    await storeKeys(keys);
    await storeAlerts(alerts);

    // Detect new keys
    const currentKeyIds = keys.map((k) => k.id);
    const newKeyIds = await markKeysSeen(currentKeyIds);

    if (newKeyIds.length > 0) {
      chrome.notifications.create(`new-keys-${Date.now()}`, {
        type: "basic",
        iconUrl: "icon-48.svg",
        title: "New API Keys Detected",
        message: `${newKeyIds.length} new API key${newKeyIds.length > 1 ? "s" : ""} found in AICostCentral.`,
        priority: 1,
      });
    }

    // Detect new alerts with severity critical or warning
    const currentAlertIds = alerts.map((a) => a.id);
    const lastAlertIds = state.lastAlertIds;
    const newAlertIds = detectNewAlerts(currentAlertIds, lastAlertIds);

    const newCriticalOrWarning = alerts.filter(
      (a) =>
        newAlertIds.includes(a.id) &&
        (a.severity === "critical" || a.severity === "warning")
    );

    if (newCriticalOrWarning.length > 0) {
      const criticalCount = newCriticalOrWarning.filter(
        (a) => a.severity === "critical"
      ).length;
      const title =
        criticalCount > 0
          ? `${criticalCount} Critical Alert${criticalCount > 1 ? "s" : ""}`
          : "New Alerts";

      chrome.notifications.create(`new-alerts-${Date.now()}`, {
        type: "basic",
        iconUrl: "icon-48.svg",
        title,
        message: newCriticalOrWarning
          .slice(0, 3)
          .map((a) => a.subject)
          .join(", "),
        priority: criticalCount > 0 ? 2 : 1,
      });
    }

    // Update lastFetch timestamp
    chrome.storage.local.set({ lastFetch: new Date().toISOString() });
  } catch (err) {
    console.error("AICostCentral service-worker runCheck error:", err);
  }
}

function setupAlarm(): void {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_PERIOD_MINUTES,
        delayInMinutes: 1,
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  // Run an initial check after install
  void runCheck();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void runCheck();
  }
});
