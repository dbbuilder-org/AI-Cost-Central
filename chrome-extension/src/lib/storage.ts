import type { Settings, StoredState, KeyMetadata, Alert, ApiKey } from "../types/index.js";

const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: "https://ai-cost-central.vercel.app",
  namingTemplate: "{project}-{provider}-{YYYY-MM}",
  renewalWarnDays: 30,
  alertEmailTo: "",
};

const DEFAULT_STATE: StoredState = {
  settings: DEFAULT_SETTINGS,
  keyMetadata: {},
  lastSeenKeyIds: [],
  lastAlertIds: [],
  recentAlerts: [],
  recentKeys: [],
  lastFetch: undefined,
};

// In-memory fallback for test environments
let _memoryStore: StoredState = JSON.parse(JSON.stringify(DEFAULT_STATE));

function isChromeAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.storage !== "undefined" &&
    typeof chrome.storage.local !== "undefined"
  );
}

async function chromeGet<T>(keys: string[]): Promise<Record<string, T>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result as Record<string, T>);
      }
    });
  });
}

async function chromeSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

export async function getState(): Promise<StoredState> {
  if (!isChromeAvailable()) {
    return JSON.parse(JSON.stringify(_memoryStore)) as StoredState;
  }

  const result = await chromeGet<unknown>([
    "settings",
    "keyMetadata",
    "lastSeenKeyIds",
    "lastAlertIds",
    "recentAlerts",
    "recentKeys",
    "lastFetch",
  ]);

  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...((result["settings"] as Partial<Settings>) ?? {}),
    },
    keyMetadata: (result["keyMetadata"] as Record<string, KeyMetadata>) ?? {},
    lastSeenKeyIds: (result["lastSeenKeyIds"] as string[]) ?? [],
    lastAlertIds: (result["lastAlertIds"] as string[]) ?? [],
    recentAlerts: (result["recentAlerts"] as Alert[]) ?? [],
    recentKeys: (result["recentKeys"] as ApiKey[]) ?? [],
    lastFetch: result["lastFetch"] as string | undefined,
  };
}

export async function updateSettings(partial: Partial<Settings>): Promise<void> {
  if (!isChromeAvailable()) {
    _memoryStore.settings = { ..._memoryStore.settings, ...partial };
    return;
  }

  const result = await chromeGet<Partial<Settings>>(["settings"]);
  const current = { ...DEFAULT_SETTINGS, ...((result["settings"] as Partial<Settings>) ?? {}) };
  await chromeSet({ settings: { ...current, ...partial } });
}

export async function setKeyMetadata(
  keyId: string,
  meta: KeyMetadata
): Promise<void> {
  if (!isChromeAvailable()) {
    _memoryStore.keyMetadata[keyId] = meta;
    return;
  }

  const result = await chromeGet<Record<string, KeyMetadata>>(["keyMetadata"]);
  const current = (result["keyMetadata"] as Record<string, KeyMetadata>) ?? {};
  await chromeSet({ keyMetadata: { ...current, [keyId]: meta } });
}

/**
 * Mark key IDs as seen. Returns array of newly seen IDs (present in currentIds but not lastSeen).
 */
export async function markKeysSeen(currentIds: string[]): Promise<string[]> {
  if (!isChromeAvailable()) {
    const lastSeen = _memoryStore.lastSeenKeyIds;
    const newIds = currentIds.filter((id) => !lastSeen.includes(id));
    _memoryStore.lastSeenKeyIds = currentIds;
    return newIds;
  }

  const result = await chromeGet<string[]>(["lastSeenKeyIds"]);
  const lastSeen = (result["lastSeenKeyIds"] as string[]) ?? [];
  const newIds = currentIds.filter((id) => !lastSeen.includes(id));
  await chromeSet({ lastSeenKeyIds: currentIds });
  return newIds;
}

export async function storeAlerts(alerts: Alert[]): Promise<void> {
  const alertIds = alerts.map((a) => a.id);

  if (!isChromeAvailable()) {
    _memoryStore.recentAlerts = alerts;
    _memoryStore.lastAlertIds = alertIds;
    return;
  }

  await chromeSet({ recentAlerts: alerts, lastAlertIds: alertIds });
}

export async function storeKeys(keys: ApiKey[]): Promise<void> {
  if (!isChromeAvailable()) {
    _memoryStore.recentKeys = keys;
    return;
  }

  await chromeSet({ recentKeys: keys });
}

/** Reset memory store (for tests) */
export function _resetMemoryStore(): void {
  _memoryStore = JSON.parse(JSON.stringify(DEFAULT_STATE));
}
