import { ROCKSKY_API_URL } from "../consts";
import getLastDays from "../lib/getLastDays";
import type { Artist } from "../types/artist";

export default async function getTopArtists(handle: string) {
  const [start, end] = getLastDays(7);
  const url = new URL(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.actor.getActorArtists`,
  );
  url.searchParams.append("did", handle);
  url.searchParams.append("startDate", start.toISOString());
  url.searchParams.append("endDate", end.toISOString());
  url.searchParams.append("limit", "20");

  const res = await fetch(url);

  if (!res.ok) {
    return { topArtists: [], ok: res.ok };
  }

  const { artists } = (await res.json()) as { artists: Artist[] };
  return { topArtists: artists, ok: res.ok };
}
