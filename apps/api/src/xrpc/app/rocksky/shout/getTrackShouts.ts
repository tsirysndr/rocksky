import type { Context } from "context";
import { consola } from "consola";
import { count, desc, eq, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ShoutView } from "lexicon/types/app/rocksky/shout/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/shout/getTrackShouts";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getTrackShouts = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ shouts: [] });
      }),
    );
  server.app.rocksky.shout.getTrackShouts({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getTrackShouts(params));
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
}): Effect.Effect<{ shouts: Shouts; users: Users }[], Error> => {
  return Effect.tryPromise({
    try: async () => {
      const [user] = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, "did"))
        .execute();
      return ctx.db
        .select({
          shouts: user
            ? {
                id: tables.shouts.id,
                content: tables.shouts.content,
                createdAt: tables.shouts.createdAt,
                uri: tables.shouts.uri,
                parent: tables.shouts.parentId,
                likes: count(tables.shoutLikes.id).as("likes"),
                liked: sql<boolean>`
            EXISTS (
              SELECT 1
              FROM ${tables.shoutLikes}
              WHERE ${tables.shoutLikes}.shout_id = ${tables.shouts}.xata_id
                AND ${tables.shoutLikes}.user_id = ${user.id}
            )`.as("liked"),
              }
            : {
                id: tables.shouts.id,
                content: tables.shouts.content,
                createdAt: tables.shouts.createdAt,
                uri: tables.shouts.uri,
                parent: tables.shouts.parentId,
                likes: count(tables.shoutLikes.id).as("likes"),
              },
          users: {
            id: tables.users.id,
            did: tables.users.did,
            handle: tables.users.handle,
            displayName: tables.users.displayName,
            avatar: tables.users.avatar,
          },
        })
        .from(tables.shouts)
        .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
        .leftJoin(tables.tracks, eq(tables.shouts.trackId, tables.tracks.id))
        .leftJoin(
          tables.shoutLikes,
          eq(tables.shouts.id, tables.shoutLikes.shoutId),
        )
        .where(eq(tables.tracks.uri, params.uri))
        .groupBy(
          tables.shouts.id,
          tables.shouts.content,
          tables.shouts.createdAt,
          tables.shouts.uri,
          tables.shouts.parentId,
          tables.users.id,
          tables.users.did,
          tables.users.handle,
          tables.users.displayName,
          tables.users.avatar,
        )
        .orderBy(desc(tables.shouts.createdAt))
        .execute();
    },
    catch: (error) => new Error(`Failed to retrieve track shouts: ${error}`),
  });
};

const presentation = (
  data: {
    shouts: Shouts;
    users: Users;
  }[],
): Effect.Effect<ShoutView, never> => {
  return Effect.sync(() => ({
    shouts: data.map((item) => ({
      ...item.shouts,
      createdAt: item.shouts.createdAt.toISOString(),
      author: item.users,
    })),
  }));
};

type Shouts = {
  id: string;
  content: string;
  createdAt: Date;
  parent?: string;
  uri: string;
  likes: number;
  liked?: boolean;
};

type Users = {
  id: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
};
