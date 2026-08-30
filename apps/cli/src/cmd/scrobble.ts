import { matchTrack } from "lib/matchTrack";
import { publishScrobble } from "scrobble";

export async function scrobble(
  track: string,
  artist: string,
  { album, timestamp, dryRun },
) {
  const match = await matchTrack(track, artist, album);

  if (!match) {
    process.exit(1);
  }

  const success = await publishScrobble(match, timestamp, dryRun);

  if (!success) {
    process.exit(1);
  }

  process.exit(0);
}
