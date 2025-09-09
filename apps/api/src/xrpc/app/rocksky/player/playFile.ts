import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/player/playFile";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const playFile = (params, auth: HandlerAuth) =>
    pipe(
      {
        params,
        ctx,
        did: auth.credentials?.did,
      },
      handlePlayFile,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.player.playFile({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(playFile(params, auth));
    },
  });
}

const handlePlayFile = ({
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
      await ctx.db.transaction(async (tx) => {
        await tx.select().from(tables.queueTracks).execute();
        // Logic to play the file would go here
      });
    },
    catch: (err) => {
      console.error(err);
      return {};
    },
  });

const presentation = (): Effect.Effect<{}, never> => {
  return Effect.sync(() => ({}));
};
