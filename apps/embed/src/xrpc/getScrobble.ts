import { ROCKSKY_API_URL } from "../consts";
import type { Scrobble } from "../types/scrobble";

export default async function getScrobble(uri: string) {
  const url = new URL(
    `${ROCKSKY_API_URL}/xrpc/app.rocksky.scrobble.getScrobble`,
  );
  url.searchParams.append("uri", uri);
  const res = await fetch(url);

  if (!res.ok) {
    return { scrobble: null, ok: res.ok };
  }

  const scrobble = (await res.json()) as Scrobble;
  return { scrobble, ok: res.ok };
}
