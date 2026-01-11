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
  const getFollows = (params: QueryParams) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(([user, follows, cursor, totalCount]) =>
        presentation(user, follows, cursor, totalCount),
      ),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({
          subject: undefined,
          follows: [],
          count: 0,
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
}): Effect.Effect<
  [SelectUser | undefined, SelectUser[], string | undefined, number],
  Error
> => {
  // Build where conditions dynamically
  const buildWhereConditions = () => {
    const conditions = [eq(tables.follows.follower_did, params.actor)];

    if (params.cursor) {
      conditions.push(
        lt(tables.follows.createdAt, new Date(Number(params.cursor))),
      );
    }

    if (params.dids && params.dids.length > 0) {
      conditions.push(inArray(tables.follows.subject_did, params.dids));
    }

    return conditions.length > 1 ? and(...conditions) : conditions[0];
  };

  const whereConditions = buildWhereConditions();

  // Build where conditions for count (without cursor)
  const buildCountWhereConditions = () => {
    const conditions = [eq(tables.follows.follower_did, params.actor)];

    if (params.dids && params.dids.length > 0) {
      conditions.push(inArray(tables.follows.subject_did, params.dids));
    }

    return conditions.length > 1 ? and(...conditions) : conditions[0];
  };

  const countWhereConditions = buildCountWhereConditions();

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
          .where(whereConditions)
          .leftJoin(
            tables.users,
            eq(tables.users.did, tables.follows.subject_did),
          )
          .orderBy(desc(tables.follows.createdAt))
          .limit(params.limit ?? 50)
          .execute()
          .then((rows) => rows.map(({ users }) => users)),
        ctx.db
          .select()
          .from(tables.follows)
          .where(whereConditions)
          .orderBy(desc(tables.follows.createdAt))
          .limit(params.limit ?? 50)
          .execute()
          .then((rows) =>
            rows?.length > 0
              ? rows[rows.length - 1]?.createdAt.getTime().toString(10)
              : undefined,
          ),
        ctx.db
          .select({ count: count() })
          .from(tables.follows)
          .where(countWhereConditions)
          .execute()
          .then((rows) => rows[0]?.count ?? 0),
      ]),
    catch: (error) => new Error(`Failed to retrieve user follows: ${error}`),
  });
};

const presentation = (
  user: SelectUser | undefined,
  follows: SelectUser[],
  cursor: string | undefined,
  count: number,
): Effect.Effect<
  {
    subject: ProfileViewBasic;
    follows: ProfileViewBasic[];
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
    follows: follows.map((follow) => ({
      id: follow.id,
      did: follow.did,
      handle: follow.handle,
      displayName: follow.displayName,
      avatar: follow.avatar,
      createdAt: follow.createdAt.toISOString(),
      updatedAt: follow.updatedAt.toISOString(),
    })),
    cursor,
    count,
  }));
};
