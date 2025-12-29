import type { Context } from "context";
import { asc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/album/getAlbumTracks";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import { dedupeTracksKeepLyrics } from "lib";
import * as R from "ramda";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getAlbumTracks = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.album.getAlbumTracks({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getAlbumTracks(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({ params, ctx }: { params: QueryParams; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.albumTracks)
        .leftJoin(
          tables.tracks,
          eq(tables.albumTracks.trackId, tables.tracks.id),
        )
        .leftJoin(
          tables.albums,
          eq(tables.albumTracks.albumId, tables.albums.id),
        )
        .leftJoin(
          tables.userAlbums,
          eq(tables.albums.id, tables.userAlbums.albumId),
        )
        .where(eq(tables.userAlbums.uri, params.uri))
        .orderBy(asc(tables.tracks.discNumber), asc(tables.tracks.trackNumber))
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
    catch: (error) => new Error(`Failed to retrieve album tracks: ${error}`),
  });
};

const presentation = (
  tracks,
): Effect.Effect<{ tracks: SongViewBasic[] }, never> => {
  return Effect.sync(() => ({ tracks }));
};
