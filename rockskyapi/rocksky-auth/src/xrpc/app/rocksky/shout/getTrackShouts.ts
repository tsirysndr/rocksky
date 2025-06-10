import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getTrackShouts = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ albums: [] });
      })
    );
  server.app.rocksky.shout.getTrackShouts({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getTrackShouts(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to retrieve track shouts: ${error}`),
  });
};

const presentation = () => {
  return Effect.sync(() => ({
    shouts: [],
  }));
};
