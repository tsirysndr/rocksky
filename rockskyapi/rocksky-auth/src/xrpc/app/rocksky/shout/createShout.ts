import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { InputSchema } from "lexicon/types/app/rocksky/shout/createShout";

export default function (server: Server, ctx: Context) {
  const createShout = (params) =>
    pipe(
      { params, ctx },
      putRecord,
      Effect.flatMap(saveIntoDatabase),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.shout.createShout({
    handler: async ({ input }) => {
      const result = await Effect.runPromise(createShout(input.body));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const putRecord = ({ params, ctx }: { params: InputSchema; ctx: Context }) => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to put shout record: ${error}`),
  });
};

const saveIntoDatabase = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to create shout: ${error}`),
  });
};

const presentation = () => {
  return Effect.sync(() => ({
    shouts: [],
  }));
};
