import { useQuery } from "@tanstack/react-query";
import { RockskyClient } from "client";

// ISO timestamp for 7 days ago — the "top of the week" window.
function sevenDaysAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

// Fetch the last-7-days top list; if it's empty, fall back to all-time.
async function topWeeklyOrAllTime(
  fetch: (opts: { limit: number; startDate?: string }) => Promise<any[]>,
  limit: number,
): Promise<any[]> {
  const weekly = await fetch({ limit, startDate: sevenDaysAgo() });
  if (weekly && weekly.length > 0) return weekly;
  return fetch({ limit });
}

export function useCurrentUser(token?: string) {
  return useQuery({
    queryKey: ["me", token],
    enabled: !!token,
    queryFn: () => new RockskyClient(token).getCurrentUser(),
  });
}

export function useActorScrobbles(token?: string, did?: string, limit = 25) {
  return useQuery({
    queryKey: ["actorScrobbles", did, limit],
    enabled: !!token && !!did,
    queryFn: () => new RockskyClient(token).getActorScrobbles(did!, { limit }),
    // Keep the "recent scrobbles" list live.
    refetchInterval: 20000,
    refetchIntervalInBackground: true,
  });
}

export function useActorSongs(token?: string, did?: string, limit = 25) {
  return useQuery({
    queryKey: ["actorSongs", did, limit],
    enabled: !!token && !!did,
    queryFn: () =>
      topWeeklyOrAllTime(
        (opts) => new RockskyClient(token).getActorSongs(did!, opts),
        limit,
      ),
  });
}

export function useActorArtists(token?: string, did?: string, limit = 25) {
  return useQuery({
    queryKey: ["actorArtists", did, limit],
    enabled: !!token && !!did,
    queryFn: () =>
      topWeeklyOrAllTime(
        (opts) => new RockskyClient(token).getActorArtists(did!, opts),
        limit,
      ),
  });
}

export function useActorAlbums(token?: string, did?: string, limit = 25) {
  return useQuery({
    queryKey: ["actorAlbums", did, limit],
    enabled: !!token && !!did,
    queryFn: () =>
      topWeeklyOrAllTime(
        (opts) => new RockskyClient(token).getActorAlbums(did!, opts),
        limit,
      ),
  });
}

export function useStats(token?: string, did?: string) {
  return useQuery({
    queryKey: ["stats", did],
    enabled: !!did,
    queryFn: () => new RockskyClient(token).getStats(did!),
  });
}
