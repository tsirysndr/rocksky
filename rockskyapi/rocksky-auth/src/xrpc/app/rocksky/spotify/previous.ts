import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/previous";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const previous = (params, auth: HandlerAuth) =>
    pipe(
      params,
      handlePrevious,
      presentation,
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.spotify.previous({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(previous(params, auth));
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

const handlePrevious = (params) => {
  // Logic to handle the previous action in Spotify
  return Effect.tryPromise({
    try: async () => ({}),
    catch: (error) => new Error(`Failed to handle previous action: ${error}`),
  });
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return Effect.sync(() => ({}));
};
