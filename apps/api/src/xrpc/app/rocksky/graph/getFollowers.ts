import type { Context } from "context";
import { consola } from "consola";
import { eq, desc, and, lt, inArray, count } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getFollowers";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import tables from "schema";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getFollowers = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({
          subject: {} satisfies ProfileViewBasic,
          followers: [] as ProfileViewBasic[],
          count: 0,
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
}): Effect.Effect<
  [SelectUser | undefined, SelectUser[], string | undefined, number],
  Error
> => {
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
          .where(
            params.cursor
              ? and(
                  ...[
                    lt(
                      tables.follows.createdAt,
                      new Date(Number(params.cursor)),
                    ),
                    eq(tables.follows.subject_did, params.actor),
                    params.dids && params.dids?.length > 0
                      ? inArray(tables.follows.follower_did, params.dids)
                      : undefined,
                  ],
                )
              : and(
                  ...[
                    eq(tables.follows.subject_did, params.actor),
                    params.dids && params.dids?.length > 0
                      ? inArray(tables.follows.follower_did, params.dids)
                      : undefined,
                  ],
                ),
          )
          .leftJoin(
            tables.users,
            eq(tables.users.did, tables.follows.follower_did),
          )
          .orderBy(desc(tables.follows.createdAt))
          .limit(params.limit ?? 50)
          .execute()
          .then((rows) => rows.map(({ users }) => users)),
        ctx.db
          .select()
          .from(tables.follows)
          .where(
            params.cursor
              ? and(
                  ...[
                    lt(
                      tables.follows.createdAt,
                      new Date(Number(params.cursor)),
                    ),
                    eq(tables.follows.subject_did, params.actor),
                    params.dids &&
                      params.dids?.length > 0 &&
                      inArray(tables.follows.follower_did, params.dids),
                  ],
                )
              : and(
                  ...[
                    eq(tables.follows.subject_did, params.actor),
                    params.dids && params.dids?.length > 0
                      ? inArray(tables.follows.follower_did, params.dids)
                      : undefined,
                  ],
                ),
          )
          .orderBy(desc(tables.follows.createdAt))
          .limit(params.limit ?? 50)
          .execute()
          .then((rows) =>
            rows.length > 0
              ? rows[rows.length - 1]?.createdAt.getTime().toString(10)
              : undefined,
          ),
        ctx.db
          .select({ count: count() })
          .from(tables.follows)
          .where(
            params.dids && params.dids?.length > 0
              ? and(
                  eq(tables.follows.subject_did, params.actor),
                  inArray(tables.follows.follower_did, params.dids),
                )
              : eq(tables.follows.subject_did, params.actor),
          )
          .execute()
          .then((rows) => rows[0]?.count ?? 0),
      ]),
    catch: (error) => new Error(`Failed to retrieve user followers: ${error}`),
  });
};

const presentation = ([user, followers, cursor, totalCount]: [
  SelectUser | undefined,
  SelectUser[],
  string | undefined,
  number,
]): Effect.Effect<
  {
    subject: ProfileViewBasic;
    followers: ProfileViewBasic[];
    cursor?: string;
    count: number;
  },
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
    followers: followers.map((follower) => ({
      id: follower.id,
      did: follower.did,
      handle: follower.handle,
      displayName: follower.displayName,
      avatar: follower.avatar,
      createdAt: follower.createdAt.toISOString(),
      updatedAt: follower.updatedAt.toISOString(),
    })),
    cursor,
    count: totalCount,
  }));
};
