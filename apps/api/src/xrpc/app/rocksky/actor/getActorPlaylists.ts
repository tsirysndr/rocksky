import { Context } from "context";
import { eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/actor/getActorPlaylists";
import { PlaylistViewBasic } from "lexicon/types/app/rocksky/playlist/defs";
import tables from "schema";
import { SelectPlaylist } from "schema/playlists";

export default function (server: Server, ctx: Context) {
  const getActorPlaylists = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ playlists: [] });
      })
    );
  server.app.rocksky.actor.getActorPlaylists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getActorPlaylists(params));
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
}): Effect.Effect<Playlist[], Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select({
          users: tables.users,
          playlists: tables.playlists,
          trackCount: sql<number>`
          (SELECT COUNT(*)
           FROM ${tables.playlistTracks}
           WHERE ${tables.playlistTracks.playlistId} = ${tables.playlists.id}
          )`.as("trackCount"),
        })
        .from(tables.playlists)
        .leftJoin(tables.users, eq(tables.playlists.createdBy, tables.users.id))
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did)
          )
        )
        .offset(params.offset)
        .limit(params.limit)
        .execute()
        .then((rows) =>
          rows.map((row) => ({
            ...row.playlists,
            trackCount: row.trackCount,
            title: row.playlists.name,
            coverImageUrl: row.playlists.picture,
            curatorDId: row.users.did,
            curatorName: row.users.displayName,
            curatorAvatarUrl: row.users.avatar,
            curatorHandle: row.users.handle,
          }))
        ),
    catch: (error) => new Error(`Failed to retrieve user playlists: ${error}`),
  });
};

const presentation = (
  playlists: Playlist[]
): Effect.Effect<{ playlists: PlaylistViewBasic[] }, never> => {
  return Effect.sync(() => ({
    playlists: playlists.map((playlist) => ({
      ...playlist,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    })),
  }));
};

type Playlist = SelectPlaylist & {
  trackCount: number;
  title: string;
  coverImageUrl: string;
  curatorDId: string;
  curatorName: string;
  curatorAvatarUrl: string;
  curatorHandle: string;
};
