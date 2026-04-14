import { useState, useEffect, useCallback } from "react";
import { loadSettings, saveSettings } from "@/lib/storage";
import { setApiBaseUrl } from "@/lib/api";
import type { Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettingsState(s);
      setApiBaseUrl(s.apiBaseUrl);
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    const next = { ...settings, ...updates };
    setSettingsState(next);
    await saveSettings(next);
    if (updates.apiBaseUrl !== undefined) {
      setApiBaseUrl(updates.apiBaseUrl);
    }
  }, [settings]);

  return { settings, updateSettings, loaded };
}
