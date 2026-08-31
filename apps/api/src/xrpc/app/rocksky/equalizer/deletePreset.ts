import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/equalizer/deletePreset";
import { createAgent } from "lib/agent";

const COLLECTION = "app.rocksky.equalizer";

export default function (server: Server, ctx: Context) {
  const deletePreset = (params: QueryParams, auth: HandlerAuth) =>
    pipe(
      { ctx, params, did: auth.credentials?.did as string | undefined },
      remove,
      Effect.timeout("10 seconds"),
    );

  server.app.rocksky.equalizer.deletePreset({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      await Effect.runPromise(deletePreset(params, auth)).catch((err) => {
        consola.error("[deletePreset]", err);
        throw err;
      });
    },
  });
}

const remove = ({
  ctx,
  params,
  did,
}: {
  ctx: Context;
  params: QueryParams;
  did: string | undefined;
}): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (!did) throw new Error("Unauthorized");

      const agent = await createAgent(ctx.oauthClient, did);
      if (!agent) throw new Error("Could not create agent");

      await agent.com.atproto.repo.deleteRecord({
        repo: agent.assertDid,
        collection: COLLECTION,
        rkey: params.rkey,
      });
    },
    catch: (error) => new Error(`Failed to delete equalizer preset: ${error}`),
  });
