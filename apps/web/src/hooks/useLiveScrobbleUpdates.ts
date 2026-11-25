import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { WS_URL } from "../consts";

/** Invalidate music views together, including profiles opened by handle. */
export function refreshScrobbleViews(client: QueryClient) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [area, section] = queryKey;
      return (
        ["infiniteFeed", "infiniteScrobbles", "scrobbles", "stories", "scrobblesChart"].includes(String(area)) ||
        (area === "stats" && section === "global") ||
        (area === "profile" && ["stats", "recent-tracks"].includes(String(section)))
      );
    },
  });
}

/** One connection for the whole app, rather than only while Home is mounted. */
export function startScrobbleUpdates(client: QueryClient) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let refresh: ReturnType<typeof setTimeout> | undefined;
  let retryMs = 1000;

  const scheduleRefresh = () => {
    if (stopped || refresh || document.visibilityState === "hidden") return;
    // Coalesce busy import bursts and give indexing time to commit. A timed
    // recovery below also covers messages delivered before the index is ready.
    refresh = setTimeout(() => {
      refresh = undefined;
      if (!stopped && document.visibilityState !== "hidden") {
        void refreshScrobbleViews(client);
      }
    }, 2000);
  };

  const connect = () => {
    if (stopped) return;
    const current = new WebSocket(WS_URL.replace(/^http/, "ws"));
    socket = current;
    current.onopen = () => {
      retryMs = 1000;
      scheduleRefresh(); // Catch up after a disconnected interval.
    };
    current.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        const message = JSON.parse(event.data);
        if (message && typeof message === "object" &&
            (typeof message.did === "string" || Array.isArray(message.scrobbles))) {
          scheduleRefresh();
        }
      } catch {
        // Ignore malformed frames; keep the recovery timer and connection alive.
      }
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (!stopped) {
        reconnect = setTimeout(connect, retryMs);
        retryMs = Math.min(30_000, retryMs * 2);
      }
    };
  };

  connect();
  const heartbeat = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
  }, 3000);
  // The relay can remain connected while its upstream or indexing is delayed.
  // Refresh only mounted queries, and pause this recovery while the tab is hidden.
  const recovery = setInterval(() => {
    if (!stopped && document.visibilityState !== "hidden") {
      void refreshScrobbleViews(client);
    }
  }, 15_000);
  document.addEventListener("visibilitychange", scheduleRefresh);

  return () => {
    stopped = true;
    clearTimeout(reconnect);
    clearTimeout(refresh);
    clearInterval(heartbeat);
    clearInterval(recovery);
    document.removeEventListener("visibilitychange", scheduleRefresh);
    socket?.close();
  };
}

export function useLiveScrobbleUpdates() {
  const client = useQueryClient();
  useEffect(() => startScrobbleUpdates(client), [client]);
}
