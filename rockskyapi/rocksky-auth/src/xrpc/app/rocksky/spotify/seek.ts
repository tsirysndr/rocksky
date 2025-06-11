import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/seek";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const seek = (params, auth: HandlerAuth) =>
    pipe(params, handleSeek, presentation);
  server.app.rocksky.spotify.seek({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = seek(params, auth);
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

const handleSeek = (params) => {
  // Logic to handle the seek action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    seek: result,
  };
};
