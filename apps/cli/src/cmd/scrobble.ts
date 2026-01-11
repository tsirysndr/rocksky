import { matchTrack } from "lib/matchTrack";
import { logger } from "logger";
import { publishScrobble } from "scrobble";

export async function scrobble(track: string, artist: string, { timestamp }) {
  const match = await matchTrack(track, artist);
  const success = await publishScrobble(match, timestamp);

  if (!success) {
    process.exit(1);
  }
}
