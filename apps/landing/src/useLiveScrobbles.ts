import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveScrobbles } from "./live-scrobbles";

export function useLiveScrobbles(enabled: boolean) {
  const cache = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    let stopped = false;
    let attempt = 0;
    let socket: WebSocket | undefined;
    let heartbeat: number | undefined;
    let retry: number | undefined;
    let fallback: number | undefined;
    const key = ["landing", "scrobbles"];
    const schedule = () => {
      if (stopped) return;
      setConnected(false);
      window.clearInterval(heartbeat);
      retry = window.setTimeout(
        connect,
        Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)),
      );
    };
    function connect() {
      if (stopped) return;
      try {
        const endpoint =
          import.meta.env.VITE_ROCKSKY_WS_URL ||
          import.meta.env.VITE_WS_URL ||
          "wss://ws.rocksky.app";
        socket = new WebSocket(endpoint.replace(/^http/, "ws"));
        socket.onopen = () => {
          if (stopped) {
            socket?.close();
            return;
          }
          attempt = 0;
          setConnected(true);
          heartbeat = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
          }, 3000);
        };
        socket.onmessage = (event) => {
          if (
            stopped ||
            event.data === "pong" ||
            typeof event.data !== "string"
          )
            return;
          try {
            const message = JSON.parse(event.data);
            const tracks = liveScrobbles(message);
            if (tracks) {
              // Cancel an older in-flight snapshot before installing the pushed feed.
              void cache
                .cancelQueries({ queryKey: key, exact: true })
                .then(() => {
                  if (!stopped) cache.setQueryData(key, tracks);
                });
            } else if (
              typeof message?.uri === "string" &&
              message.uri.includes("/app.rocksky.scrobble/")
            ) {
              if (fallback) return;
              fallback = window.setTimeout(() => {
                fallback = undefined;
                void cache.invalidateQueries(
                  { queryKey: key, exact: true },
                  { cancelRefetch: false },
                );
              }, 500);
            }
          } catch {
            /* Ignore malformed frames and heartbeat acknowledgements. */
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = schedule;
      } catch {
        schedule();
      }
    }
    connect();
    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(retry);
      window.clearTimeout(fallback);
      socket?.close();
    };
  }, [enabled, cache]);
  return connected;
}
