import type { Context } from "context";
import { eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getFollowers";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getFollowers = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({
          subject: {} satisfies ProfileViewBasic,
          followers: [] as ProfileViewBasic[],
        });
      }),
    );
  server.app.rocksky.graph.getFollowers({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getFollowers(params));
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
}): Effect.Effect<any[], Error> => {
  return Effect.tryPromise({
    try: () =>
      ctx.db
        .select()
        .from(tables.follows)
        .where(eq(tables.follows.subject_did, params.actor))
        .leftJoin(
          tables.users,
          eq(tables.users.did, tables.follows.follower_did),
        )
        .execute()
        .then((rows) =>
          rows.map(({ users }) => ({
            id: users.id,
            did: users.did,
            handle: users.handle,
            displayName: users.displayName,
            avatar: users.avatar,
            createdAt: users.createdAt.toISOString(),
            updatedAt: users.updatedAt.toISOString(),
          })),
        ),
    catch: (error) => new Error(`Failed to retrieve user followers: ${error}`),
  });
};

const presentation = (
  followers: any[],
): Effect.Effect<
  { subject: ProfileViewBasic; followers: ProfileViewBasic[] },
  never
> => {
  return Effect.sync(() => ({
    subject: {} satisfies ProfileViewBasic,
    followers: [],
  }));
};
