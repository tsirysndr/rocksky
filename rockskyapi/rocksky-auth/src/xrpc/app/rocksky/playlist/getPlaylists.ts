import { Context } from "context";
import { desc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { PlaylistViewBasic } from "lexicon/types/app/rocksky/playlist/defs";
import { QueryParams } from "lexicon/types/app/rocksky/playlist/getPlaylists";
import * as R from "ramda";
import tables from "schema";
import { SelectPlaylist } from "schema/playlists";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getPlaylists = (params) =>
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
  server.app.rocksky.playlist.getPlaylists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getPlaylists(params));
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
}): Effect.Effect<Playlists, Error> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.userPlaylists)
        .leftJoin(
          tables.playlists,
          eq(tables.userPlaylists.playlistId, tables.playlists.id)
        )
        .leftJoin(tables.users, eq(tables.userPlaylists, tables.users.id))
        .orderBy(desc(tables.playlists.createdAt))
        .limit(params.limit || 20)
        .offset(params.offset || 0)
        .execute(),
    catch: (error) => new Error(`Failed to retrieve playlists: ${error}`),
  });
};

const presentation = (
  data: Playlists
): Effect.Effect<{ playlists: PlaylistViewBasic[] }, never> => {
  return Effect.sync(() => ({
    playlists: data.map((playlist) => ({
      ...R.omit(["picture", "name"], playlist.playlists),
      title: playlist.playlists.name,
      coverImageUrl: playlist.playlists.picture,
      curatorDId: playlist.users.did,
      createdAt: playlist.playlists.createdAt.toISOString(),
      updatedAt: playlist.playlists.updatedAt.toISOString(),
    })),
  }));
};

type Playlists = {
  playlists: SelectPlaylist;
  users: SelectUser;
}[];
