import { matchTrack } from "lib/matchTrack";
import { logger } from "logger";

export async function scrobble(track: string, artist: string, { timestamp }) {
  await matchTrack(track, artist);
  logger.info`>> scrobble ${track}, ${artist}, ${timestamp}`;
}
