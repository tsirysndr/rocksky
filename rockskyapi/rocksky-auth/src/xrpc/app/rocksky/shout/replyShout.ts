import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const replyShout = (params) =>
    pipe(
      { params, ctx },
      reply,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ albums: [] });
      })
    );
  server.app.rocksky.shout.replyShout({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(replyShout(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const reply = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to reply to shout: ${error}`),
  });
};

const presentation = () => {
  return Effect.sync(() => ({
    shouts: [],
  }));
};
