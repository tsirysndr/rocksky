import type { Context } from "context";
import { asc, eq, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { PlaylistViewDetailed } from "lexicon/types/app/rocksky/playlist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/playlist/getPlaylist";
import * as R from "ramda";
import tables from "schema";
import type { SelectPlaylist } from "schema/playlists";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getPlaylist = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.playlist.getPlaylist({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getPlaylist(params));
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
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<[Playlist, SelectTrack[]], Error> => {
  return Effect.tryPromise({
    try: async () =>
      Promise.all([
        ctx.db
          .select({
            playlists: tables.playlists,
            users: tables.users,
            trackCount: sql<number>`
              (SELECT COUNT(*)
                FROM ${tables.playlistTracks}
                WHERE ${tables.playlistTracks.playlistId} = ${tables.playlists.id}
              )`.as("trackCount"),
          })
          .from(tables.userPlaylists)
          .leftJoin(
            tables.playlists,
            eq(tables.userPlaylists.playlistId, tables.playlists.id),
          )
          .leftJoin(
            tables.users,
            eq(tables.userPlaylists.userId, tables.users.id),
          )
          .where(eq(tables.playlists.uri, params.uri))
          .execute()
          .then(([row]) => row),
        ctx.db
          .select()
          .from(tables.playlistTracks)
          .leftJoin(
            tables.tracks,
            eq(tables.playlistTracks.trackId, tables.tracks.id),
          )
          .leftJoin(
            tables.playlists,
            eq(tables.playlistTracks.playlistId, tables.playlists.id),
          )
          .where(eq(tables.playlists.uri, params.uri))
          .orderBy(asc(tables.playlistTracks.createdAt))
          .execute()
          .then((rows) => rows.map((row) => row.tracks)),
      ]),
    catch: (error) => new Error(`Failed to retrieve playlist: ${error}`),
  });
};

const presentation = ([playlist, tracks]: [
  Playlist,
  SelectTrack[],
]): Effect.Effect<PlaylistViewDetailed, never> => {
  return Effect.sync(() => ({
    ...R.omit(["name", "picture"], playlist.playlists),
    tracks: tracks.map((track) => ({
      ...R.omit(["lyrics"], track),
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
    })),
    title: playlist.playlists.name,
    coverImageUrl: playlist.playlists.picture,
    curatorDId: playlist.users.did,
    curatorName: playlist.users.displayName,
    curatorAvatarUrl: playlist.users.avatar,
    curatorHandle: playlist.users.handle,
    createdAt: playlist.playlists.createdAt.toISOString(),
    updatedAt: playlist.playlists.updatedAt.toISOString(),
    trackCount: playlist.trackCount,
  }));
};

type Playlist = {
  playlists: SelectPlaylist;
  users: SelectUser;
  trackCount: number;
};
