import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { InputSchema } from "lexicon/types/app/rocksky/shout/createShout";

export default function (server: Server, ctx: Context) {
  const createShout = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
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
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(createShout(input.body, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const putRecord = ({
  params,
  ctx,
  did,
}: {
  params: InputSchema;
  ctx: Context;
  did?: string;
}) => {
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
