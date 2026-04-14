/**
 * Expo push notification setup.
 * Requests permissions and registers the Expo push token with the backend.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerPushToken, unregisterPushToken } from "./api";
import { savePushToken } from "./storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestPushPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const granted = await requestPushPermissions();
  if (!granted) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "AI Cost Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn("[notifications] EAS projectId not set in app.json");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

export async function enablePushNotifications(): Promise<string | null> {
  const token = await getExpoPushToken();
  if (!token) return null;

  try {
    await registerPushToken(token);
    await savePushToken(token);
    return token;
  } catch (err) {
    console.error("[notifications] registration failed:", err);
    return null;
  }
}

export async function disablePushNotifications(token: string): Promise<void> {
  try {
    await unregisterPushToken(token);
    await savePushToken(null);
  } catch (err) {
    console.error("[notifications] unregistration failed:", err);
  }
}

export function useNotificationListener(
  onNotification: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(onNotification);
}

export function useNotificationResponseListener(
  onResponse: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(onResponse);
}
