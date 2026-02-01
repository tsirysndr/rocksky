import { ROCKSKY_API_URL } from "../consts";
import getLastDays from "../lib/getLastDays";
import type { Track } from "../types/track";

export default async function getTopAlbums(handle: string) {
  const [start, end] = getLastDays(7);
  const url = new URL(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.actor.getActorSongs`,
  );
  url.searchParams.append("did", handle);
  url.searchParams.append("startDate", start.toISOString());
  url.searchParams.append("endDate", end.toISOString());
  url.searchParams.append("limit", "20");

  const res = await fetch(url);

  if (!res.ok) {
    return { topTracks: [], ok: res.ok };
  }

  const { tracks } = (await res.json()) as { tracks: Track[] };
  return { topTracks: tracks, ok: res.ok };
}
