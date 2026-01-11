import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";

export default function (server: Server, ctx: Context) {
  const getApikeys = (params, auth: HandlerAuth) =>
    pipe(
      params,
      retrieve,
      presentation,
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({});
      }),
    );
  server.app.rocksky.apikey.getApikeys({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getApikeys(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = () => {
  // Logic to retrieve API keys
  return [];
};

const presentation = (apikeys) => {
  // Logic to format the API keys for presentation
  return Effect.sync(() => ({
    apikeys: [],
  }));
};
