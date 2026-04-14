/**
 * Settings persistence using expo-secure-store for sensitive data
 * and AsyncStorage for general settings.
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Settings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

const SETTINGS_KEY = "acc:settings";
const API_URL_KEY = "acc:apiBaseUrl";

export async function saveSettings(settings: Settings): Promise<void> {
  // Store API URL in SecureStore (may contain tokens in URL)
  await SecureStore.setItemAsync(API_URL_KEY, settings.apiBaseUrl);
  // Store the rest in AsyncStorage
  const rest = { ...settings, apiBaseUrl: "" };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
}

export async function loadSettings(): Promise<Settings> {
  try {
    const [apiBaseUrl, raw] = await Promise.all([
      SecureStore.getItemAsync(API_URL_KEY),
      AsyncStorage.getItem(SETTINGS_KEY),
    ]);
    const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      apiBaseUrl: apiBaseUrl ?? DEFAULT_SETTINGS.apiBaseUrl,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function savePushToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync("acc:pushToken", token);
  } else {
    await SecureStore.deleteItemAsync("acc:pushToken");
  }
}

export async function loadPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("acc:pushToken");
  } catch {
    return null;
  }
}
