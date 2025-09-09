import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const reportShout = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx },
      report,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.shout.reportShout({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(reportShout(params, auth));
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
