import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LIVE_FEED_SNAPSHOT, liveScrobbles } from "./live-scrobbles";

export function useLiveScrobbles(enabled: boolean) {
  const cache = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(false);
    if (!enabled) return;
    let stopped = false;
    let source: EventSource;
    let lastResponse = Date.now();
    let healthy = false;
    let generation = 0;
    const key = ["landing", "scrobbles"];
    const endpoint =
      import.meta.env.VITE_ROCKSKY_SSE_URL ||
      `${(import.meta.env.VITE_ROCKSKY_API_URL || "https://api.rocksky.app").replace(/\/$/, "")}/events/scrobbles`;
    function connect() {
      source = new EventSource(endpoint);
      source.addEventListener("scrobbles", (event) => {
        if (stopped) return;
        try {
          const tracks = liveScrobbles(
            JSON.parse((event as MessageEvent).data),
          );
          if (!tracks) return;
          lastResponse = Date.now();
          // A snapshot confirms delivery; subsequent heartbeats report upstream health.
          healthy = true;
          setConnected(true);
          cache.setQueryData(LIVE_FEED_SNAPSHOT, {
            tracks,
            receivedAt: lastResponse,
          });
          const current = ++generation;
          void cache.cancelQueries({ queryKey: key, exact: true }).then(() => {
            if (!stopped && current === generation)
              cache.setQueryData(key, tracks);
          });
        } catch {
          /* Ignore malformed events; the HTTP recovery remains active. */
        }
      });
      source.addEventListener("heartbeat", (event) => {
        if (stopped) return;
        try {
          const status = JSON.parse((event as MessageEvent).data);
          healthy = status.healthy === true;
          lastResponse = Date.now();
          setConnected(healthy);
        } catch {
          /* Let the watchdog reconnect a broken stream. */
        }
      });
      // EventSource retries automatically, including after a proxy or network failure.
      source.onerror = () => {
        healthy = false;
        setConnected(false);
      };
    }
    connect();
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastResponse > 45_000) {
        healthy = false;
        setConnected(false);
        source.close();
        lastResponse = Date.now();
        connect();
      } else if (!healthy) setConnected(false);
    }, 5000);
    return () => {
      stopped = true;
      window.clearInterval(watchdog);
      source.close();
    };
  }, [enabled, cache]);
  return connected;
}
