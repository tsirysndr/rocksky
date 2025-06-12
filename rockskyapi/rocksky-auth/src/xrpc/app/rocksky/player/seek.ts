import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/player/seek";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const seek = (params, auth: HandlerAuth) =>
    pipe(
      params,
      handleSeek,
      presentation,
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.player.seek({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = seek(params, auth);
    },
  });
}

const withUser = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({ user: users[0], ctx, params })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const handleSeek = (params) => {
  // Logic to handle seek action
  // This could involve updating the current playback position
  // based on the provided parameters.
};

const presentation = () => {
  // Logic to format the response for seek action
  // This could return the updated playback position or any relevant information.
  return Effect.sync(() => ({}));
};
