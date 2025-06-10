import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const reportShout = (params) =>
    pipe(
      { params, ctx },
      report,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ albums: [] });
      })
    );
  server.app.rocksky.shout.reportShout({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(reportShout(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const report = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to report shout: ${error}`),
  });
};

const presentation = () => {
  return Effect.sync(() => ({
    shouts: [],
  }));
};
