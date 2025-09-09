import type { Agent } from "@atproto/api";
import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { InputSchema } from "lexicon/types/app/rocksky/shout/createShout";
import { createAgent } from "lib/agent";
import tables from "schema";
import type { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const createShout = (input, auth: HandlerAuth) =>
    pipe(
      { input, ctx, did: auth.credentials?.did },
      withAgent,
      Effect.flatMap(withUser),
      Effect.flatMap(putRecord),
      Effect.flatMap(saveIntoDatabase),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      }),
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

const withAgent = ({
  input,
  ctx,
  did,
}: {
  input: InputSchema;
  ctx: Context;
  did: string;
}): Effect.Effect<
  {
    agent: Agent;
    ctx: Context;
    did: string;
    input: InputSchema;
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () =>
      createAgent(ctx.oauthClient, did).then((agent) => ({
        agent,
        ctx,
        did,
        input,
      })),
    catch: (error) => new Error(`Failed to create agent: ${error}`),
  });
};

const withUser = ({
  input,
  ctx,
  did,
  agent,
}: {
  input: InputSchema;
  ctx: Context;
  did?: string;
  agent: Agent;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({ user: users[0], ctx, input, agent })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const putRecord = ({
  input,
  ctx,
  did,
  user,
  agent,
}: {
  input: InputSchema;
  ctx: Context;
  did?: string;
  user: SelectUser;
  agent: Agent;
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
