import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getProfileShouts = (params) =>
    pipe(
      { params, ctx },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ shouts: [] });
      })
    );
  server.app.rocksky.shout.getProfileShouts({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getProfileShouts(params));
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
    catch: (error) => new Error(`Failed to retrieve profile shouts: ${error}`),
  });
};

const presentation = () => {
  return Effect.sync(() => ({
    shouts: [],
  }));
};
