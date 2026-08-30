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
  album?: string,
): Promise<MatchTrackResult | null> {
  let match;
  // The album narrows the match, so it must narrow the cache key too — the
  // same title/artist can resolve to different editions per requested album.
  const cacheKey = album
    ? `${track} - ${artist} - ${album}`
    : `${track} - ${artist}`;
  const cached = await ctx.kv.getItem(cacheKey);
  const client = new RockskyClient();

  if (cached) {
    match = cached;
    client.matchSong(track, artist, album).then((newMatch) => {
      if (newMatch) {
        ctx.kv.setItem(cacheKey.toLowerCase(), newMatch);
      }
    });
  } else {
    match = await client.matchSong(track, artist, album);
    await ctx.kv.setItem(cacheKey.toLowerCase(), match);
  }

  if (!match.title || !match.artist) {
    logger.error`Failed to match track ${track} by ${artist}`;
    return null;
  }

  logger.info`💿 Matched track ${match.title} by ${match.artist}`;

  return match;
}
