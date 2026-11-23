import { RockskyClient } from "@rocksky/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atom, useAtomValue } from "jotai";
import { normalizeScrobble } from "./normalize";
import { useLiveScrobbles } from "./useLiveScrobbles";
import {
  LIVE_FEED_SNAPSHOT,
  reconcileScrobbles,
  type LiveFeedSnapshot,
} from "./live-scrobbles";

export const appUrl = (
  import.meta.env.VITE_ROCKSKY_APP_URL || "https://rocksky.app"
).replace(/\/$/, "");
export const client = new RockskyClient(
  import.meta.env.VITE_ROCKSKY_API_URL || "https://api.rocksky.app",
);
export const liveAtom = atom(true);
export const menuAtom = atom(false);

// Public AppView reads: no session or secret is needed. React Query suspends
// polling in background tabs and refreshes when the browser reconnects.
export function useCommunity() {
  const live = useAtomValue(liveAtom);
  const connected = useLiveScrobbles(live);
  const cache = useQueryClient();
  const stats = useQuery({
    queryKey: ["landing", "stats"],
    queryFn: () => client.globalStats(),
    refetchInterval: live ? 30_000 : false,
  });
  const feed = useQuery({
    queryKey: ["landing", "scrobbles"],
    queryFn: async () => {
      const snapshot = (await client.scrobbleFeed(undefined, false, 15)).map(
        normalizeScrobble,
      );
      return reconcileScrobbles(
        snapshot,
        cache.getQueryData<LiveFeedSnapshot>(LIVE_FEED_SNAPSHOT),
      );
    },
    // Keep HTTP recovery active even while the SSE connection is open.
    refetchInterval: live ? 15_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  return { stats, feed, live, connected };
}

export function relativeTime(value?: string) {
  if (!value) return "Recently";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function trackUrl(uri?: string) {
  const match = uri?.match(/^at:\/\/([^/]+)\/app\.rocksky\.song\/([^/]+)$/);
  return match
    ? `${appUrl}/${encodeURIComponent(match[1])}/song/${encodeURIComponent(match[2])}`
    : undefined;
}

export function scrobbleUrl(uri?: string) {
  const match = uri?.match(/^at:\/\/([^/]+)\/app\.rocksky\.scrobble\/([^/]+)$/);
  return match
    ? `${appUrl}/${encodeURIComponent(match[1])}/scrobble/${encodeURIComponent(match[2])}`
    : undefined;
}
