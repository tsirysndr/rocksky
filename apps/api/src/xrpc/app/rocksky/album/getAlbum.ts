import type { Context } from "context";
import { consola } from "consola";
import { asc, count, eq, or } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { AlbumViewDetailed } from "lexicon/types/app/rocksky/album/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/album/getAlbum";
import { dedupeTracksKeepLyrics } from "lib";
import * as R from "ramda";
import tables from "schema";
import type { SelectAlbum } from "schema/albums";
import type { SelectTrack } from "schema/tracks";
import type { SelectArtist } from "schema/artists";

export default function (server: Server, ctx: Context) {
  const getAlbum = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.album.getAlbum({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getAlbum(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () => {
      const { albums: album, artists: artist } = await ctx.db
        .select()
        .from(tables.userAlbums)
        .leftJoin(
          tables.albums,
          eq(tables.userAlbums.albumId, tables.albums.id),
        )
        .leftJoin(
          tables.artists,
          eq(tables.albums.artistUri, tables.artists.uri),
        )
        .where(
          or(
            eq(tables.userAlbums.uri, params.uri),
            eq(tables.albums.uri, params.uri),
          ),
        )
        .execute()
        .then((rows) => rows[0]);
      return Promise.all([
        Promise.resolve(album),
        Promise.resolve(artist),
        ctx.db
          .select()
          .from(tables.albumTracks)
          .leftJoin(
            tables.tracks,
            eq(tables.albumTracks.trackId, tables.tracks.id),
          )
          .where(eq(tables.albumTracks.albumId, album?.id))
          .orderBy(
            asc(tables.tracks.discNumber),
            asc(tables.tracks.trackNumber),
          )
          .execute()
          .then((rows) => rows.map((data) => data.tracks))
          .then(dedupeTracksKeepLyrics)
          .then((tracks) =>
            tracks.map((track) => ({
              ...R.omit(["lyrics"], track),
              createdAt: track.createdAt.toISOString(),
              updatedAt: track.updatedAt.toISOString(),
            })),
          ),
        ctx.db
          .select({ count: count() })
          .from(tables.userAlbums)
          .where(eq(tables.userAlbums.albumId, album?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
        ctx.db
          .select({ count: count() })
          .from(tables.scrobbles)
          .where(eq(tables.scrobbles.albumId, album?.id))
          .execute()
          .then((rows) => rows[0]?.count || 0),
      ]);
    },
    catch: (error) => {
      consola.info("Error retrieving album:", error);
      return new Error(`Failed to retrieve album: ${error}`);
    },
  });
};

const presentation = ([album, artist, tracks, uniqueListeners, playCount]: [
  SelectAlbum,
  SelectArtist,
  SelectTrack[],
  number,
  number,
]): Effect.Effect<AlbumViewDetailed, never> => {
  return Effect.sync(() => ({
    ...album,
    tags: artist?.genres || [],
    tracks,
    playCount,
    uniqueListeners,
    createdAt: album.createdAt.toISOString(),
  }));
};
