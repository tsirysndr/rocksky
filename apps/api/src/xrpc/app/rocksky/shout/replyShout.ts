import type { Agent } from "@atproto/api";
import type { HandlerAuth } from "@atproto/xrpc-server";
import { consola } from "consola";
import type { Context } from "context";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/shout/replyShout";
import { createAgent } from "lib/agent";

export default function (server: Server, ctx: Context) {
  const replyShout = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx },
      reply,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ albums: [] });
      }),
    );
  server.app.rocksky.shout.replyShout({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(replyShout(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const withAgent = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did: string;
}): Effect.Effect<
  {
    agent: Agent;
    ctx: Context;
    did: string;
    params: QueryParams;
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () =>
      createAgent(ctx.oauthClient, did).then((agent) => ({
        agent,
        ctx,
        did,
        params,
      })),
    catch: (error) => new Error(`Failed to create agent: ${error}`),
  });
};

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
