import { ROCKSKY_API_URL } from "../consts";
import getLastDays from "../lib/getLastDays";
import type { Album } from "../types/album";

export default async function getTopAlbums(handle: string) {
  const [start, end] = getLastDays(7);
  const url = new URL(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.actor.getActorAlbums`,
  );
  url.searchParams.append("did", handle);
  url.searchParams.append("startDate", start.toISOString());
  url.searchParams.append("endDate", end.toISOString());
  url.searchParams.append("limit", "20");
  const res = await fetch(url);

  if (!res.ok) {
    return { topAlbums: [], ok: res.ok };
  }

  const { albums } = (await res.json()) as { albums: Album[] };
  return { topAlbums: albums, ok: res.ok };
}
