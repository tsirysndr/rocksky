import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/previous";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const previous = (params) => pipe(params, handlePrevious, presentation);
  server.app.rocksky.spotify.previous({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = previous(params);
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

const handlePrevious = (params) => {
  // Logic to handle the previous action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    previous: result,
  };
};
