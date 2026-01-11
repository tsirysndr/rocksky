import { RockskyClient } from "client";
import { ctx } from "context";
import { logger } from "logger";
import { SelectTrack } from "schema/tracks";

export type MusicBrainzArtist = {
  mbid: string;
  name: string;
};

export type MatchTrackResult = SelectTrack & {
  genres: string[] | null;
  artistPicture: string | null;
  releaseDate: string | null;
  year: number | null;
  mbArtists: MusicBrainzArtist[] | null;
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

  logger.info`Matched track ${match.title} by ${match.artist}`;

  return match;
}
