import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/playlist/startPlaylist";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const startPlaylist = (params, auth: HandlerAuth) =>
    pipe(
      {
        params,
        ctx,
        did: auth.credentials?.did,
      },
      start,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.playlist.startPlaylist({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(startPlaylist(params, auth));
    },
  });
}

const start = ({
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
        await tx.select().from(tables.playlists).execute();
        // Logic to start the playlist would go here
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
