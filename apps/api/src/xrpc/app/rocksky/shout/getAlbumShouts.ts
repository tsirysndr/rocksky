import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { count, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm/sql";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { ShoutView } from "lexicon/types/app/rocksky/shout/defs";
import { QueryParams } from "lexicon/types/app/rocksky/shout/getAlbumShouts";
import tables from "schema";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getAlbumShouts = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      getCurrentUser,
      Effect.flatMap(retrieve),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ shouts: [] });
      })
    );
  server.app.rocksky.shout.getAlbumShouts({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getAlbumShouts(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const getCurrentUser = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({ user: users[0], ctx, params })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const retrieve = ({
  user,
  params,
  ctx,
}: {
  user?: SelectUser;
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ shouts: Shouts; users: Users }[], Error> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select({
          shouts: user
            ? {
                id: tables.shouts.id,
                content: tables.shouts.content,
                createdAt: tables.shouts.createdAt,
                parent: tables.shouts.parentId,
                uri: tables.shouts.uri,
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
                parent: tables.shouts.parentId,
                uri: tables.shouts.uri,
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
        .leftJoin(tables.albums, eq(tables.shouts.albumId, tables.albums.id))
        .leftJoin(
          tables.shoutLikes,
          eq(tables.shouts.id, tables.shoutLikes.shoutId)
        )
        .where(eq(tables.albums.uri, params.uri))
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
          tables.users.avatar
        )
        .orderBy(desc(tables.shouts.createdAt))
        .execute(),
    catch: (error) => new Error(`Failed to retrieve album shouts: ${error}`),
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
