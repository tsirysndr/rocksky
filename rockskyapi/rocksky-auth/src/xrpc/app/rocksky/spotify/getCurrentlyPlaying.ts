import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/getCurrentlyPlaying";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getCurrentlyPlaying = (params, auth: HandlerAuth) =>
    pipe(params, retrieve, presentation);
  server.app.rocksky.spotify.getCurrentlyPlaying({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = getCurrentlyPlaying(params, auth);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const getCurrentUser = ({
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

const retrieve = () => {
  // Logic to retrieve currently playing track
  return {};
};

const presentation = (currentlyPlaying) => {
  // Logic to format the currently playing track for presentation
  return {};
};
