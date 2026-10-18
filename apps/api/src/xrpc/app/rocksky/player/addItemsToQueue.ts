import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/player/addItemsToQueue";
import { transientDbRetry } from "lib/dbRetry";

export default function (server: Server, ctx: Context) {
  const addItemsToQueue = (params, auth: HandlerAuth) =>
    pipe(
      {
        params,
        ctx,
        did: auth.credentials?.did,
      },
      handleAddItemsToQueue,
      Effect.flatMap(presentation),
      Effect.retry(transientDbRetry),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.player.addItemsToQueue({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(addItemsToQueue(params, auth));
    },
  });
}

const handleAddItemsToQueue = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      if (!did) {
        throw new Error("Authentication required");
      }

        await ctx.tracklist.post("/tracklist.addTracks", {
          did,
          track_ids: params.items,
        });
    },
    catch: (err) => {
      consola.error(err);
      return {};
    },
  });

const presentation = (): Effect.Effect<{}, never> => {
  return Effect.sync(() => ({}));
};
