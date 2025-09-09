import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/playlist/removePlaylist";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const removePlaylist = (params, auth: HandlerAuth) =>
    pipe(
      {
        params,
        ctx,
        did: auth.credentials?.did,
      },
      remove,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.playlist.removePlaylist({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(removePlaylist(params, auth));
    },
  });
}

const remove = ({
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
      await ctx.db.select().from(tables.playlists).execute();
      // Logic to remove the playlist would go here
    },
    catch: (err) => {
      console.error(err);
      return {};
    },
  });

const presentation = (): Effect.Effect<{}, never> => {
  return Effect.sync(() => ({}));
};
