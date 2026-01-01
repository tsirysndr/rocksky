import type { Context } from "context";
import { and, eq, sql } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/getKnownFollowers";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import tables from "schema";
import type { HandlerAuth } from "@atproto/xrpc-server";

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
  {
    subjectDid: string;
    knownFollowers: Array<ProfileViewBasic & { id: string }>;
  },
  Error
> => {
  if (!viewerDid) {
    return Effect.succeed({
      subjectDid: params.actor,
      knownFollowers: [],
    });
  }

  return Effect.tryPromise({
    try: async () => {
      const knownFollowers = await ctx.db
        .select({
          id: tables.users.id,
          did: tables.users.did,
          handle: tables.users.handle,
          displayName: tables.users.displayName,
          avatar: tables.users.avatar,
          createdAt: tables.users.createdAt,
          updatedAt: tables.users.updatedAt,
        })
        .from(tables.follows)
        .innerJoin(
          tables.users,
          eq(tables.users.did, tables.follows.follower_did),
        )
        .where(
          and(
            eq(tables.follows.subject_did, params.actor),
            sql`EXISTS (
              SELECT 1 FROM ${tables.follows} f2
              WHERE f2.subject_did = ${tables.users.did}
                AND f2.follower_did = ${viewerDid}
            )`,
          ),
        )
        .limit(params.limit ?? 100)
        .execute();

      return {
        subjectDid: params.actor,
        knownFollowers: knownFollowers.map((u) => ({
          id: u.id,
          did: u.did,
          handle: u.handle,
          displayName: u.displayName,
          avatar: u.avatar,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        })),
      };
    },
    catch: (error) => new Error(`Failed to retrieve known followers: ${error}`),
  });
};

const presentation = ({
  subjectDid,
  knownFollowers,
}: {
  subjectDid: string;
  knownFollowers: Array<ProfileViewBasic & { id: string }>;
}): Effect.Effect<
  { subject: ProfileViewBasic; followers: ProfileViewBasic[] },
  never
> => {
  return Effect.sync(() => ({
    subject: {
      did: subjectDid,
    } satisfies ProfileViewBasic,
    followers: knownFollowers.map(
      ({ id, ...profile }) => profile as ProfileViewBasic,
    ),
  }));
};
