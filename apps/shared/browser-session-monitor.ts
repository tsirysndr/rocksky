import { createSessionMonitor } from "./session-monitor";

export function monitorBrowserSession(apiUrl: string, onExpired: () => void) {
  const monitor = createSessionMonitor({
    apiUrl,
    getToken: () => localStorage.getItem("token"),
    onExpired,
    isActive: () => document.visibilityState !== "hidden",
  });
  const check = () => void monitor.check();
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
  return () => {
    monitor.stop();
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
  };
}
