import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const previous = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      withSpotifyToken,
      Effect.flatMap(handlePrevious),
      Effect.flatMap(presentation),
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

const withSpotifyToken = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to retrieve Spotify token: ${error}`),
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
