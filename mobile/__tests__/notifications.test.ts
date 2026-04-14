/**
 * Tests for push notification helper functions.
 * Mocks expo-notifications and expo-device.
 */

// Mock expo-notifications before import
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5 },
}));

jest.mock("expo-device", () => ({
  isDevice: true,
}));

jest.mock("expo-constants", () => ({
  expoConfig: {
    extra: { eas: { projectId: "test-project-id" } },
  },
  easConfig: null,
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("@/lib/api", () => ({
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
}));

jest.mock("@/lib/storage", () => ({
  savePushToken: jest.fn(),
  loadPushToken: jest.fn(),
}));

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { registerPushToken, unregisterPushToken } from "@/lib/api";
import { savePushToken } from "@/lib/storage";
import {
  requestPushPermissions,
  getExpoPushToken,
  enablePushNotifications,
  disablePushNotifications,
} from "@/lib/notifications";

const mockGetPerms = Notifications.getPermissionsAsync as jest.Mock;
const mockReqPerms = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const mockSetChannel = Notifications.setNotificationChannelAsync as jest.Mock;
const mockRegister = registerPushToken as jest.Mock;
const mockUnregister = unregisterPushToken as jest.Mock;
const mockSaveToken = savePushToken as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requestPushPermissions", () => {
  it("returns true when permission already granted", async () => {
    mockGetPerms.mockResolvedValue({ status: "granted" });
    const result = await requestPushPermissions();
    expect(result).toBe(true);
    expect(mockReqPerms).not.toHaveBeenCalled();
  });

  it("requests permission when not granted", async () => {
    mockGetPerms.mockResolvedValue({ status: "undetermined" });
    mockReqPerms.mockResolvedValue({ status: "granted" });
    const result = await requestPushPermissions();
    expect(result).toBe(true);
    expect(mockReqPerms).toHaveBeenCalled();
  });

  it("returns false when permission denied", async () => {
    mockGetPerms.mockResolvedValue({ status: "undetermined" });
    mockReqPerms.mockResolvedValue({ status: "denied" });
    const result = await requestPushPermissions();
    expect(result).toBe(false);
  });

  it("returns false on a simulator (isDevice=false)", async () => {
    (Device as { isDevice: boolean }).isDevice = false;
    const result = await requestPushPermissions();
    expect(result).toBe(false);
    (Device as { isDevice: boolean }).isDevice = true;
  });
});

describe("getExpoPushToken", () => {
  it("returns token when permissions granted", async () => {
    mockGetPerms.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[test-token-123]" });

    const token = await getExpoPushToken();
    expect(token).toBe("ExponentPushToken[test-token-123]");
    expect(mockGetToken).toHaveBeenCalledWith({ projectId: "test-project-id" });
  });

  it("returns null when permissions denied", async () => {
    mockGetPerms.mockResolvedValue({ status: "undetermined" });
    mockReqPerms.mockResolvedValue({ status: "denied" });

    const token = await getExpoPushToken();
    expect(token).toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});

describe("enablePushNotifications", () => {
  it("registers token and saves it", async () => {
    mockGetPerms.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc123]" });
    mockRegister.mockResolvedValue(undefined);
    mockSaveToken.mockResolvedValue(undefined);

    const result = await enablePushNotifications();
    expect(result).toBe("ExponentPushToken[abc123]");
    expect(mockRegister).toHaveBeenCalledWith("ExponentPushToken[abc123]");
    expect(mockSaveToken).toHaveBeenCalledWith("ExponentPushToken[abc123]");
  });

  it("returns null when token registration fails", async () => {
    mockGetPerms.mockResolvedValue({ status: "granted" });
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc123]" });
    mockRegister.mockRejectedValue(new Error("Network error"));

    const result = await enablePushNotifications();
    expect(result).toBeNull();
  });
});

describe("disablePushNotifications", () => {
  it("unregisters and clears saved token", async () => {
    mockUnregister.mockResolvedValue(undefined);
    mockSaveToken.mockResolvedValue(undefined);

    await disablePushNotifications("ExponentPushToken[abc123]");
    expect(mockUnregister).toHaveBeenCalledWith("ExponentPushToken[abc123]");
    expect(mockSaveToken).toHaveBeenCalledWith(null);
  });

  it("does not throw on unregister failure", async () => {
    mockUnregister.mockRejectedValue(new Error("Server error"));
    // Should not throw
    await expect(
      disablePushNotifications("ExponentPushToken[abc123]")
    ).resolves.toBeUndefined();
  });
});
