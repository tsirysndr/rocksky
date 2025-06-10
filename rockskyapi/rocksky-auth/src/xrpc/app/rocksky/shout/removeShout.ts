import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const removeShout = (params) =>
    pipe(
      { params, ctx },
      remove,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ albums: [] });
      })
    );
  server.app.rocksky.shout.removeShout({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(removeShout(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const remove = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to remove shout: ${error}`),
  });
};

const presentation = () => {
  return Effect.sync(() => ({
    shouts: [],
  }));
};
