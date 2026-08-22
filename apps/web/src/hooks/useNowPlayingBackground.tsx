import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { getScrobbles } from "../api/feed";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { profileAtom } from "../atoms/profile";
import { WS_URL } from "../consts";

// Scrobbles are recorded without a duration in some sources; keep the
// backdrop up for a typical song length in that case.
const FALLBACK_DURATION = 5 * 60 * 1000;

const isStillPlaying = (scrobble: { date: string; duration: number }) => {
  const duration =
    scrobble.duration > 0 ? scrobble.duration : FALLBACK_DURATION;
  return Date.parse(scrobble.date) + duration > Date.now();
};

/**
 * Album art to use as the app-wide backdrop, or null when nothing is playing.
 *
 * Priority: the connected player's current track (always in sync while
 * playing), otherwise the logged-in user's most recent scrobble until
 * `scrobble time + track duration` has elapsed. The scrobble side updates in
 * real time via the scrobble firehose WebSocket.
 */
export default function useNowPlayingBackground(): string | null {
  const devicePlayback = useAtomValue(nowPlayingAtom);
  const profile = useAtomValue(profileAtom);
  const did = profile?.did || localStorage.getItem("did") || "";
  const queryClient = useQueryClient();

  const { data: latestScrobble } = useQuery({
    queryKey: ["latestScrobble", did],
    queryFn: async () => {
      const { scrobbles } = await getScrobbles(did, false, 0, 1);
      return scrobbles[0] ?? null;
    },
    enabled: !!did,
  });

  // Re-render once the latest scrobble runs out so the backdrop clears
  // without any further event.
  const [, bumpExpiryCheck] = useState(0);
  useEffect(() => {
    if (!latestScrobble) return;
    const duration =
      latestScrobble.duration > 0 ? latestScrobble.duration : FALLBACK_DURATION;
    const remaining = Date.parse(latestScrobble.date) + duration - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(
      () => bumpExpiryCheck((n) => n + 1),
      remaining,
    );
    return () => window.clearTimeout(timer);
  }, [latestScrobble]);

  useEffect(() => {
    if (!did) return;

    let ws: WebSocket | null = null;
    let heartbeat: number | undefined;
    let reconnect: number | undefined;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(`${WS_URL.replace("http", "ws")}`);

      ws.onopen = () => {
        heartbeat = window.setInterval(() => ws?.send("ping"), 3000);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const message = JSON.parse(event.data);
          if (message.did === did) {
            queryClient.invalidateQueries({
              queryKey: ["latestScrobble", did],
            });
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        window.clearInterval(heartbeat);
        if (!stopped) {
          reconnect = window.setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(reconnect);
      ws?.close();
    };
  }, [did, queryClient]);

  if (devicePlayback?.isPlaying) {
    return devicePlayback.albumArt ?? null;
  }

  if (!latestScrobble?.cover || !isStillPlaying(latestScrobble)) {
    return null;
  }

  return latestScrobble.cover;
}
