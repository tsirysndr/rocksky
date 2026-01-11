import { RockskyClient } from "client";
import { ctx } from "context";
import { logger } from "logger";
import { SelectTrack } from "schema/tracks";

export type MatchTrackResult = SelectTrack & {
  genres: string[] | null;
  artistPicture: string | null;
  releaseDate: Date | null;
  year: number | null;
};

export async function matchTrack(
  track: string,
  artist: string,
): Promise<MatchTrackResult | null> {
  let match;
  const cached = await ctx.kv.getItem(`${track} - ${artist}`);
  const client = new RockskyClient();

  if (cached) {
    match = cached;
    client.matchSong(track, artist).then((newMatch) => {
      if (newMatch) {
        ctx.kv.setItem(`${track} - ${artist}`, newMatch);
      }
    });
  } else {
    match = await client.matchSong(track, artist);
    await ctx.kv.setItem(`${track} - ${artist}`, match);
  }

  logger.info`>> matchTrack ${track}, ${artist}`;
  logger.info`${match}`;

  return match;
}
