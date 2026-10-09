import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { scrobbler } from "../../modules/rocksky-scrobbler";
import { createNotificationAccessCheck } from "../lib/notificationAccess";

export function useNotificationAccess(signedInAndReady: boolean) {
  useEffect(() => {
    if (!signedInAndReady || Platform.OS !== "android" || !scrobbler) return;
    const native = scrobbler;
    const check = createNotificationAccessCheck({
      hasAccess: async () => (await native.status()).notificationAccess,
      openSettings: () => native.openNotificationAccess(),
      onError: (error) =>
        console.warn("Notification access check failed", error),
    });
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === previousState) return;
      previousState = state;
      if (state === "active") void check.resume();
      else check.pause();
    });
    if (previousState === "active") void check.resume();
    return () => {
      check.dispose();
      subscription.remove();
    };
  }, [signedInAndReady]);
}
