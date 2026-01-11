import { matchTrack } from "lib/matchTrack";
import { logger } from "logger";
import { publishScrobble } from "scrobble";

export async function scrobble(track: string, artist: string, { timestamp }) {
  const match = await matchTrack(track, artist);
  await publishScrobble(match, timestamp);
}
