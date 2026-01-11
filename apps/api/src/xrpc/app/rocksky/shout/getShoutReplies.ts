import type { Context } from "context";
import { consola } from "consola";
import { asc, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ShoutView } from "lexicon/types/app/rocksky/shout/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/shout/getShoutReplies";
import tables from "schema";
import type { SelectShout } from "schema/shouts";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getShoutReplies = (params) =>
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
  server.app.rocksky.shout.getShoutReplies({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getShoutReplies(params));
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
}): Effect.Effect<{ shouts: SelectShout; users: SelectUser }[], Error> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select({
          shouts: tables.shouts,
          users: tables.users,
        })
        .from(tables.shouts)
        .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
        .where(eq(tables.shouts.parentId, params.uri))
        .orderBy(asc(tables.shouts.createdAt))
        .execute(),
    catch: (error) => new Error(`Failed to retrieve shout replies: ${error}`),
  });
};

const presentation = (
  data: { shouts: SelectShout; users: SelectUser }[],
): Effect.Effect<ShoutView, never> => {
  return Effect.sync(() => ({
    shouts: data.map((item) => ({
      id: item.shouts.id,
      content: item.shouts.content,
      parent: item.shouts.parentId,
      uri: item.shouts.uri,
      createdAt: item.shouts.createdAt.toISOString(),
      author: {
        id: item.users.id,
        did: item.users.did,
        handle: item.users.handle,
        displayName: item.users.displayName,
        avatar: item.users.avatar,
      },
    })),
  }));
};
