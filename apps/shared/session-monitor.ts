/** Shared by browser and native clients. Only the session API's 401 is
 * authoritative; offline, timeouts, and server errors leave the login intact. */
export function createSessionMonitor(options: {
  apiUrl: string;
  getToken: () => string | null;
  onExpired: () => void | Promise<void>;
  isActive: () => boolean;
}) {
  let stopped = false;
  let pending = false;
  let expired = false;
  let controller: AbortController | undefined;
  const check = async () => {
    const token = options.getToken();
    if (stopped || pending || expired || !token || !options.isActive()) return;
    pending = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15000);
    try {
      const response = await fetch(
        `${options.apiUrl.replace(/\/$/, "")}/session/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        },
      );
      // An old request must never sign out a newly authenticated session.
      if (response.status === 401 && !stopped && options.getToken() === token) {
        expired = true;
        await options.onExpired();
      }
    } catch {
      // Try again on the next foreground event or interval.
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  };
  const interval = setInterval(() => void check(), 60000);
  void check();
  return {
    check,
    stop() {
      stopped = true;
      clearInterval(interval);
      controller?.abort();
    },
  };
}
