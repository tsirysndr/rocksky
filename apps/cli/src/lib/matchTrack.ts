import { RockskyClient } from "client";
import { ctx } from "context";
import { eq, and, or } from "drizzle-orm";
import { logger } from "logger";
import schema from "schema";
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
  const [result] = await ctx.db
    .select()
    .from(schema.tracks)
    .leftJoin(
      schema.albumTracks,
      eq(schema.albumTracks.trackId, schema.tracks.id),
    )
    .leftJoin(schema.albums, eq(schema.albumTracks.albumId, schema.albums.id))
    .leftJoin(
      schema.artistAlbums,
      eq(schema.artistAlbums.albumId, schema.albums.id),
    )
    .leftJoin(
      schema.artists,
      eq(schema.artistAlbums.artistId, schema.artists.id),
    )
    .where(
      or(
        and(eq(schema.tracks.title, track), eq(schema.tracks.artist, artist)),
        and(
          eq(schema.tracks.title, track),
          eq(schema.tracks.albumArtist, artist),
        ),
      ),
    )
    .execute();

  let match = null;

  if (result) {
    match = {
      ...result.tracks,
      genres: result.artists?.genres,
      artistPicture: result.artists?.picture,
      releaseDate: result.albums?.releaseDate,
      year: result.albums?.year,
    };
  } else {
    const client = new RockskyClient();
    match = await client.matchSong(track, artist);
  }
  logger.info`>> matchTrack ${track}, ${artist}`;
  logger.info`${match}`;

  return match;
}
