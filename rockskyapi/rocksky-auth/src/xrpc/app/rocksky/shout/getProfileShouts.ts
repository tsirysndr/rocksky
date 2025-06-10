import { Context } from "context";
import { aliasedTable, count, desc, eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { ShoutView } from "lexicon/types/app/rocksky/shout/defs";
import { QueryParams } from "lexicon/types/app/rocksky/shout/getProfileShouts";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getProfileShouts = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ shouts: [] });
      })
    );
  server.app.rocksky.shout.getProfileShouts({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getProfileShouts(params));
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
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did)
          )
        )
        .execute();
      return ctx.db
        .select({
          profileShouts: {
            id: tables.profileShouts.id,
            createdAt: tables.profileShouts.createdAt,
          },
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
                reported: sql<boolean>`
              EXISTS (
                SELECT 1
                FROM ${tables.shoutReports}
                WHERE ${tables.shoutReports}.shout_id = ${tables.shouts}.xata_id
                  AND ${tables.shoutReports}.user_id = ${user.id}
              )`.as("reported"),
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
            id: aliasedTable(tables.users, "authors").id,
            did: aliasedTable(tables.users, "authors").did,
            handle: aliasedTable(tables.users, "authors").handle,
            displayName: aliasedTable(tables.users, "authors").displayName,
            avatar: aliasedTable(tables.users, "authors").avatar,
          },
        })
        .from(tables.profileShouts)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did)
          )
        )
        .leftJoin(
          tables.shouts,
          eq(tables.profileShouts.shoutId, tables.shouts.id)
        )
        .leftJoin(
          aliasedTable(tables.users, "authors"),
          eq(tables.shouts.authorId, aliasedTable(tables.users, "authors").id)
        )
        .leftJoin(
          tables.users,
          eq(tables.profileShouts.userId, tables.users.id)
        )
        .leftJoin(
          tables.shoutLikes,
          eq(tables.shouts.id, tables.shoutLikes.shoutId)
        )
        .groupBy(
          tables.profileShouts.id,
          tables.profileShouts.createdAt,
          tables.shouts.id,
          tables.shouts.uri,
          tables.shouts.content,
          tables.shouts.createdAt,
          tables.shouts.parentId,
          tables.users.id,
          tables.users.did,
          tables.users.handle,
          tables.users.displayName,
          tables.users.avatar,
          aliasedTable(tables.users, "authors").id,
          aliasedTable(tables.users, "authors").did,
          aliasedTable(tables.users, "authors").handle,
          aliasedTable(tables.users, "authors").displayName,
          aliasedTable(tables.users, "authors").avatar
        )
        .orderBy(desc(tables.profileShouts.createdAt))
        .execute();
    },
    catch: (error) => new Error(`Failed to retrieve profile shouts: ${error}`),
  });
};

const presentation = (
  data: {
    shouts: Shouts;
    users: Users;
  }[]
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
