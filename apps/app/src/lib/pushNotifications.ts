import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { client } from "../api";

// Serialize registration and removal so logout cannot race an in-flight save.
let pending: Promise<unknown> = Promise.resolve();
let current: { auth: string; token: string } | undefined;
export function syncPushToken(auth: string, token: string) {
  pending = pending
    .catch(() => {})
    .then(async () => {
      await client.post(
        "/notifications/devices",
        { token },
        {
          headers: { Authorization: `Bearer ${auth}` },
          timeout: 15000,
        },
      );
      current = { auth, token };
      await AsyncStorage.setItem("fcmToken", token);
    });
  return pending;
}
export function removePushToken(auth?: string) {
  pending = pending
    .catch(() => {})
    .then(async () => {
      if (current && auth && current.auth !== auth) return;
      const saved = await AsyncStorage.getItem("fcmToken");
      const device =
        current || (auth && saved ? { auth, token: saved } : undefined);
      if (!device) return;
      await client.post(
        "/notifications/devices/remove",
        { token: device.token },
        {
          headers: { Authorization: `Bearer ${device.auth}` },
          timeout: 15000,
        },
      );
      current = undefined;
      await AsyncStorage.removeItem("fcmToken");
    });
  return pending;
}
export async function devicePushToken(requestPermission: boolean) {
  if (Platform.OS !== "android") return null;
  await Notifications.setNotificationChannelAsync("social", {
    name: "Social notifications",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return null;
  return String((await Notifications.getDevicePushTokenAsync()).data);
}
