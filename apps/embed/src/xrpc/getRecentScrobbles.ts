import { ROCKSKY_API_URL } from "../consts";
import type { Scrobble } from "../types/scrobble";

export default async function getRecentScrobbles(handle: string) {
  const url = new URL(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.actor.getActorScrobbles`,
  );
  url.searchParams.append("did", handle);
  url.searchParams.append("limit", "20");
  const res = await fetch(url);

  if (!res.ok) {
    return { scrobbles: [], ok: res.ok };
  }

  const { scrobbles } = (await res.json()) as { scrobbles: Scrobble[] };
  return { scrobbles, ok: res.ok };
}
