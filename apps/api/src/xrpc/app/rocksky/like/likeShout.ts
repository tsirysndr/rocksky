import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/like/likeShout";
import { createAgent } from "lib/agent";
import tables from "schema";
import { likeShout as likeShoutService } from "shouts/shouts.service";

export default function (server: Server, ctx: Context) {
  const likeShout = (input: InputSchema, auth: HandlerAuth) =>
    pipe(
      like({ input, ctx, did: auth.credentials?.did }),
      Effect.flatMap(presentation),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.like.likeShout({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(likeShout(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const like = ({
  input,
  ctx,
  did,
}: {
  input: InputSchema;
  ctx: Context;
  did?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("User is not authenticated");
      }
      if (!input.uri) {
        throw new Error("Missing shout uri");
      }

      const user = await ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .limit(1)
        .then((rows) => rows[0]);
      if (!user) {
        throw new Error("User not found");
      }

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) {
        throw new Error("Unauthorized");
      }

      await likeShoutService(ctx, input.uri, user, agent);
      return {};
    },
    catch: (error) => new Error(`Failed to like shout: ${error}`),
  });

const presentation = () => Effect.sync(() => ({}));
