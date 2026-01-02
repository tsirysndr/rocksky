import { TID } from "@atproto/common";
import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { and, eq, desc } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/followAccount";
import { createAgent } from "lib/agent";
import tables from "schema";
import type { SelectUser } from "schema/users";
import * as FollowLexicon from "lexicon/types/app/rocksky/graph/follow";

export default function (server: Server, ctx: Context) {
  const followAccount = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      handleFollow,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({
          subject: {} satisfies ProfileViewBasic,
          followers: [],
        });
      }),
    );
  server.app.rocksky.graph.followAccount({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(followAccount(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const handleFollow = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}): Effect.Effect<[SelectUser | undefined, SelectUser[]], Error> => {
  return Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      if (params.account === did) {
        throw new Error("User cannot follow themselves");
      }

      if (await isFollowing(ctx, did, params.account)) {
        throw new Error("User is already following");
      }

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) {
        throw new Error("Unauthorized");
      }

      const rkey = TID.nextStr();

      const record = {
        $type: "app.rocksky.graph.follow",
        subject: params.account,
        createdAt: new Date().toISOString(),
      };

      if (!FollowLexicon.validateRecord(record).success) {
        console.log(FollowLexicon.validateRecord(record));
        throw new Error("Invalid record");
      }

      const res = await agent.com.atproto.repo.createRecord({
        repo: agent.assertDid,
        collection: "app.rocksky.graph.follow",
        rkey,
        record,
        validate: false,
      });
      const uri = res.data.uri;
      console.log(`Follow record created at: ${uri}`);

      await ctx.db
        .insert(tables.follows)
        .values({
          uri,
          subject_did: params.account,
          follower_did: did,
        })
        .onConflictDoNothing()
        .execute();

      return Promise.all([
        ctx.db
          .select()
          .from(tables.users)
          .where(eq(tables.users.did, params.account))
          .execute()
          .then((rows) => rows[0]),
        ctx.db
          .select()
          .from(tables.follows)
          .where(eq(tables.follows.subject_did, params.account))
          .leftJoin(
            tables.users,
            eq(tables.users.did, tables.follows.follower_did),
          )
          .orderBy(desc(tables.follows.createdAt))
          .limit(50)
          .execute()
          .then((rows) => rows.map(({ users }) => users)),
      ]);
    },
    catch: (error) => new Error(`Failed to retrieve follow: ${error}`),
  });
};

const presentation = ([user, followers]: [
  SelectUser | undefined,
  SelectUser[],
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
  }));
};

const isFollowing = async (
  ctx: Context,
  followerDid: string,
  subjectDid: string,
): Promise<boolean> => {
  const result = await ctx.db
    .select()
    .from(tables.follows)
    .where(
      and(
        eq(tables.follows.follower_did, followerDid),
        eq(tables.follows.subject_did, subjectDid),
      ),
    )
    .execute();

  return result.length > 0;
};
