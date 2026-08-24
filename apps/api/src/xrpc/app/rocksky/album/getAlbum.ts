import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { consola } from "consola";
import { asc, count, eq, inArray } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { AlbumViewDetailed } from "lexicon/types/app/rocksky/album/defs";
import type { SongViewBasic } from "lexicon/types/app/rocksky/song/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/album/getAlbum";
import { dedupeTracksKeepLyrics } from "lib";
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
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
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
      const { albums: album, artists: artist } = await ctx.db
        .select()
        .from(tables.albums)
        .leftJoin(
          tables.artists,
          eq(tables.albums.artistUri, tables.artists.uri),
        )
        .where(eq(tables.albums.uri, params.uri))
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
    catch: (error) => {
      consola.info("Error retrieving album:", error);
      return new Error(`Failed to retrieve album: ${error}`);
    },
  });
};

// Same shape as the feed's like counts: one query for every track on the album,
// then folded back per track.
async function withLikes<T>(
  ctx: Context,
  tracks: T[],
  did?: string,
): Promise<(T & { likesCount: number; liked: boolean })[]> {
  const idOf = (track: T) => (track as { id?: string }).id;
  const trackIds = tracks.map(idOf).filter(Boolean);
  if (trackIds.length === 0) return [];

  const likes = await ctx.db
    .select()
    .from(tables.lovedTracks)
    .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
    .where(inArray(tables.lovedTracks.trackId, trackIds))
    .execute();

  return tracks.map((track) => {
    const trackLikes = likes.filter(
      (l) => l.loved_tracks.trackId === idOf(track),
    );
    return {
      ...track,
      likesCount: trackLikes.length,
      liked: !!did && trackLikes.some((l) => l.users?.did === did),
    };
  });
}

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
