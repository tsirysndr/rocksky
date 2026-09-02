import type { HandlerAuth } from "@atproto/xrpc-server";
import { InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import { consola } from "consola";
import { asc, count, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { AlbumViewDetailed } from "lexicon/types/app/rocksky/album/defs";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/album/getAlbum";
import { dedupeTracksKeepLyrics } from "lib";
import { withLikes } from "lib/trackLikes";
import * as R from "ramda";
import tables from "schema";
import type { SelectAlbum } from "schema/albums";
import type { SelectArtist } from "schema/artists";

export default function (server: Server, ctx: Context) {
  const getAlbum = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      // Not-found is definitive; only transient failures are worth retrying.
      Effect.retry({
        times: 3,
        while: (err) => !(err instanceof InvalidRequestError),
      }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        if (err instanceof InvalidRequestError) {
          return Effect.fail(err);
        }
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.album.getAlbum({
    // Optional: authVerifier returns {} without a token, so the album stays
    // public — a DID just means the per-track `liked` can be filled in.
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getAlbum(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () => {
      const row = await ctx.db
        .select()
        .from(tables.albums)
        .leftJoin(
          tables.artists,
          eq(tables.albums.artistUri, tables.artists.uri),
        )
        .where(eq(tables.albums.uri, params.uri))
        .execute()
        .then((rows) => rows[0]);

      if (!row?.albums) {
        throw new InvalidRequestError(
          `Album not found: ${params.uri}`,
          "NotFound",
        );
      }
      const { albums: album, artists: artist } = row;
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
          )
          .then((tracks) => withLikes(ctx, tracks, did)),
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
    catch: (error) =>
      error instanceof InvalidRequestError
        ? error
        : new Error(`Failed to retrieve album: ${error}`),
  });
};

const presentation = ([album, artist, tracks, uniqueListeners, playCount]: [
  SelectAlbum,
  SelectArtist,
  SongViewBasic[],
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
