import type { Context } from "context";
import { consola } from "consola";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/actor/getActorCompatibility";
import type { CompatibilityViewBasic } from "lexicon/types/app/rocksky/actor/defs";
import { deepCamelCaseKeys } from "lib";
import users from "schema/users";
import { eq, or } from "drizzle-orm";
import type { HandlerAuth } from "@atproto/xrpc-server";

export default function (server: Server, ctx: Context) {
  const getActorCompatibility = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("120 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ comptibility: null });
      }),
    );
  server.app.rocksky.actor.getActorCompatibility({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(
        getActorCompatibility(params, auth),
      );
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
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did: string | undefined;
}): Effect.Effect<{ data: Compatibility[] }, Error> => {
  return Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error(`User not authenticated`);
      }

      const user1 = await ctx.db
        .select()
        .from(users)
        .where(eq(users.did, did))
        .execute()
        .then((rows) => rows[0]);

      if (!user1) {
        throw new Error(`User1 not found`);
      }

      const user2 = await ctx.db
        .select()
        .from(users)
        .where(or(eq(users.did, params.did), eq(users.handle, params.did)))
        .execute()
        .then((rows) => rows[0]);

      if (!user2) {
        throw new Error(`User2 not found`);
      }

      return ctx.analytics.post("library.getCompatibility", {
        user_id1: user1.id,
        user_id2: user2.id,
      });
    },
    catch: (error) => new Error(`Failed to retrieve compatibility: ${error}`),
  });
};

const presentation = ({
  data,
}: {
  data: Compatibility[];
}): Effect.Effect<{ compatibility: CompatibilityViewBasic }, never> => {
  return Effect.sync(() => ({ compatibility: deepCamelCaseKeys(data) }));
};

type Compatibility = {
  compatibility_level: number;
  compatibility_percentage: number;
  shared_artists: number;
  top_shared_artists: string[];
  top_shared_detailed_artists: {
    id: string;
    name: string;
    picture: string;
    uri: string;
    user1_rank: number;
    user2_rank: number;
    weight: number;
  }[];
  user1_artist_count: number;
  user2_artist_count: number;
};
