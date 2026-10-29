import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import {
  devicePushToken,
  removePushToken,
  syncPushToken,
} from "../lib/pushNotifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(
  auth: string | null,
  openAlerts: () => void,
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!auth || Platform.OS !== "android") return;
    let active = true;
    const report = () =>
      console.warn("Unable to synchronize push notifications");
    const register = async (request: boolean) => {
      const token = await devicePushToken(request);
      if (!active) return;
      if (token) await syncPushToken(auth, token);
      else await removePushToken(auth);
    };
    void register(true).catch(report);
    const refresh = Notifications.addPushTokenListener((token) => {
      if (active) void syncPushToken(auth, String(token.data)).catch(report);
    });
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    const response = (result: Notifications.NotificationResponse) => {
      if (
        !active ||
        result.notification.request.content.data.screen !== "Alerts"
      )
        return;
      openAlerts();
      void Notifications.clearLastNotificationResponseAsync();
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    const tapped =
      Notifications.addNotificationResponseReceivedListener(response);
    void Notifications.getLastNotificationResponseAsync()
      .then((result) => {
        if (result) response(result);
      })
      .catch(report);
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void register(false).catch(report);
    });
    return () => {
      active = false;
      refresh.remove();
      received.remove();
      tapped.remove();
      foreground.remove();
      void removePushToken(auth).catch(report);
    };
  }, [auth, openAlerts, queryClient]);
}
