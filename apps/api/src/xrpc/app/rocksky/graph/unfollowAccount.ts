import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/graph/unfollowAccount";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const unfollowAccount = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      handleFollow,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
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
      const result = await Effect.runPromise(unfollowAccount(params, auth));
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
}): Effect.Effect<any[], Error> => {
  return Effect.tryPromise({
    try: async () => [],
    catch: (error) => new Error(`Failed to unfollow: ${error}`),
  });
};

const presentation = (
  followers: any[],
): Effect.Effect<
  { subject: ProfileViewBasic; followers: ProfileViewBasic[] },
  never
> => {
  // Logic to format the response for play action
  return Effect.sync(() => ({
    subject: {} satisfies ProfileViewBasic,
    followers: [],
  }));
};
