import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/spotify/play";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const play = (params) => pipe(params, handlePlay, presentation);
  server.app.rocksky.spotify.play({
    auth: ctx.authVerifier,
    handler: async ({ params }) => {
      const result = play(params);
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

const handlePlay = (params) => {
  // Logic to handle the play action in Spotify
  return {};
};

const presentation = (result) => {
  // Logic to format the result for presentation
  return {
    play: result,
  };
};
