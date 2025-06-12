import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const pause = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withSpotifyToken,
      Effect.flatMap(handlePause),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.spotify.pause({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(pause(params, auth));
    },
  });
}

const withSpotifyToken = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to retrieve Spotify token: ${error}`),
  });
};

const handlePause = (params) => {
  // Logic to handle the pause action in Spotify
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to handle pause action: ${error}`),
  });
};

const presentation = (result): Effect.Effect<{}, never> => {
  // Logic to format the result for presentation
  return Effect.sync(() => ({}));
};
