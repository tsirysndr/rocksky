import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { createSessionMonitor } from "../../../shared/session-monitor";
import { authTokenAtom } from "../atoms/auth";
import { API_URL } from "../consts";
import { storage } from "../storage";
import { useSignOut } from "./useSignOut";

export function useSessionMonitor() {
  const token = useAtomValue(authTokenAtom);
  const signOut = useSignOut();
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  useEffect(() => {
    if (!token) return;
    const monitor = createSessionMonitor({
      apiUrl: API_URL,
      getToken: storage.getToken,
      onExpired: () => signOutRef.current(),
      isActive: () => AppState.currentState === "active",
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void monitor.check();
    });
    return () => {
      subscription.remove();
      monitor.stop();
    };
  }, [token]);
}
