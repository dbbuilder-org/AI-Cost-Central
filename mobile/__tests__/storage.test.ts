/**
 * Tests for settings persistence (storage.ts).
 */

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
}));

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveSettings, loadSettings, savePushToken, loadPushToken } from "@/lib/storage";
import { DEFAULT_SETTINGS } from "@/types";

const mockSecureSet = SecureStore.setItemAsync as jest.Mock;
const mockSecureGet = SecureStore.getItemAsync as jest.Mock;
const mockSecureDel = SecureStore.deleteItemAsync as jest.Mock;
const mockAsyncSet = AsyncStorage.setItem as jest.Mock;
const mockAsyncGet = AsyncStorage.getItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("saveSettings", () => {
  it("stores apiBaseUrl in SecureStore and rest in AsyncStorage", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      apiBaseUrl: "https://myapp.vercel.app",
      pushEnabled: true,
    };

    mockSecureSet.mockResolvedValue(undefined);
    mockAsyncSet.mockResolvedValue(undefined);

    await saveSettings(settings);

    expect(mockSecureSet).toHaveBeenCalledWith("acc:apiBaseUrl", "https://myapp.vercel.app");
    const savedJson = JSON.parse(mockAsyncSet.mock.calls[0][1]);
    expect(savedJson.pushEnabled).toBe(true);
    expect(savedJson.apiBaseUrl).toBe(""); // blanked out in AsyncStorage
  });
});

describe("loadSettings", () => {
  it("merges SecureStore apiBaseUrl with AsyncStorage settings", async () => {
    mockSecureGet.mockResolvedValue("https://myapp.vercel.app");
    mockAsyncGet.mockResolvedValue(
      JSON.stringify({ ...DEFAULT_SETTINGS, pushEnabled: true, apiBaseUrl: "" })
    );

    const settings = await loadSettings();
    expect(settings.apiBaseUrl).toBe("https://myapp.vercel.app");
    expect(settings.pushEnabled).toBe(true);
  });

  it("returns defaults when no stored settings", async () => {
    mockSecureGet.mockResolvedValue(null);
    mockAsyncGet.mockResolvedValue(null);

    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("handles storage errors gracefully", async () => {
    mockSecureGet.mockRejectedValue(new Error("SecureStore error"));
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("savePushToken", () => {
  it("stores token in SecureStore", async () => {
    mockSecureSet.mockResolvedValue(undefined);
    await savePushToken("ExponentPushToken[abc]");
    expect(mockSecureSet).toHaveBeenCalledWith("acc:pushToken", "ExponentPushToken[abc]");
  });

  it("deletes when token is null", async () => {
    mockSecureDel.mockResolvedValue(undefined);
    await savePushToken(null);
    expect(mockSecureDel).toHaveBeenCalledWith("acc:pushToken");
  });
});

describe("loadPushToken", () => {
  it("returns stored token", async () => {
    mockSecureGet.mockResolvedValue("ExponentPushToken[abc]");
    const token = await loadPushToken();
    expect(token).toBe("ExponentPushToken[abc]");
  });

  it("returns null on error", async () => {
    mockSecureGet.mockRejectedValue(new Error("error"));
    const token = await loadPushToken();
    expect(token).toBeNull();
  });
});
