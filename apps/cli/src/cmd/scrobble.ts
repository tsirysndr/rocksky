import { matchTrack } from "lib/matchTrack";
import { publishScrobble } from "scrobble";

export async function scrobble(
  track: string,
  artist: string,
  { timestamp, dryRun },
) {
  const match = await matchTrack(track, artist);
  const success = await publishScrobble(match, timestamp, dryRun);

  if (!success) {
    process.exit(1);
  }
}
