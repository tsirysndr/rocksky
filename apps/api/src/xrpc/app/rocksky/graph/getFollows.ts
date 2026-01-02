import type { Context } from "context";
import { eq, or, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getFollowers";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import tables from "schema";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getFollows = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(([user, follows]) => presentation(user, follows)),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({
          subject: undefined,
          follows: [],
        });
      }),
    );
  server.app.rocksky.graph.getFollows({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getFollows(params));
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
}): Effect.Effect<[SelectUser | undefined, SelectUser[]], Error> => {
  return Effect.tryPromise({
    try: () =>
      Promise.all([
        ctx.db
          .select()
          .from(tables.users)
          .where(eq(tables.users.did, params.actor))
          .execute()
          .then((rows) => rows[0]),
        ctx.db
          .select()
          .from(tables.follows)
          .where(eq(tables.follows.follower_did, params.actor))
          .leftJoin(
            tables.users,
            eq(tables.users.did, tables.follows.follower_did),
          )
          .execute()
          .then((rows) => rows.map(({ users }) => users)),
      ]),
    catch: (error) => new Error(`Failed to retrieve user follows: ${error}`),
  });
};

const presentation = (
  user: SelectUser | undefined,
  follows: SelectUser[],
): Effect.Effect<
  { subject: ProfileViewBasic; follows: ProfileViewBasic[] },
  never
> => {
  return Effect.sync(() => ({
    subject: {
      id: user?.id,
      did: user?.did,
      handle: user?.handle,
      displayName: user?.displayName,
      avatar: user?.avatar,
      createdAt: user?.createdAt.toISOString(),
      updatedAt: user?.updatedAt.toISOString(),
    },
    follows: follows.map((follow) => ({
      id: follow.id,
      did: follow.did,
      handle: follow.handle,
      displayName: follow.displayName,
      avatar: follow.avatar,
      createdAt: follow.createdAt.toISOString(),
      updatedAt: follow.updatedAt.toISOString(),
    })),
  }));
};
