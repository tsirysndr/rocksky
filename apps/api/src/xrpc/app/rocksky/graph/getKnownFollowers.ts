import type { Context } from "context";
import { and, eq, sql, desc, lt } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getKnownFollowers";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import tables from "schema";
import type { HandlerAuth } from "@atproto/xrpc-server";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const getKnownFollowers = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, viewerDid: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error("getKnownFollowers error:", err);
        return Effect.succeed({
          subject: {} satisfies ProfileViewBasic,
          followers: [] as ProfileViewBasic[],
        });
      }),
    );

  server.app.rocksky.graph.getKnownFollowers({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getKnownFollowers(params, auth));
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
  viewerDid,
}: {
  params: QueryParams;
  ctx: Context;
  viewerDid?: string;
}): Effect.Effect<
  [SelectUser | undefined, SelectUser[], string | undefined],
  Error
> => {
  if (!viewerDid) {
    return Effect.succeed([undefined, [], undefined]);
  }

  return Effect.tryPromise({
    try: async () => {
      const user = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, params.actor))
        .execute()
        .then((rows) => rows[0]);
      const knownFollowers = await ctx.db
        .select()
        .from(tables.follows)
        .innerJoin(
          tables.users,
          eq(tables.users.did, tables.follows.follower_did),
        )
        .where(
          params.cursor
            ? and(
                lt(tables.follows.createdAt, new Date(params.cursor)),
                eq(tables.follows.subject_did, params.actor),
                sql`EXISTS (
              SELECT 1 FROM ${tables.follows} f2
              WHERE f2.subject_did = ${tables.users.did}
                AND f2.follower_did = ${viewerDid}
            )`,
              )
            : and(
                eq(tables.follows.subject_did, params.actor),
                sql`EXISTS (
              SELECT 1 FROM ${tables.follows} f2
              WHERE f2.subject_did = ${tables.users.did}
                AND f2.follower_did = ${viewerDid}
            )`,
              ),
        )
        .orderBy(desc(tables.follows.createdAt))
        .limit(params.limit ?? 50)
        .execute();
      const cursor =
        knownFollowers.length > 0
          ? knownFollowers[knownFollowers.length - 1].follows.createdAt
              .getTime()
              .toString()
          : undefined;
      return [user, knownFollowers.map((row) => row.users), cursor];
    },
    catch: (error) => new Error(`Failed to retrieve known followers: ${error}`),
  });
};

const presentation = ([user, followers, cursor]: [
  SelectUser | undefined,
  SelectUser[],
  string | undefined,
]): Effect.Effect<
  { subject: ProfileViewBasic; followers: ProfileViewBasic[] },
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
  }));
};
