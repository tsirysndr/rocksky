import { Agent } from "@atproto/api";
import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { InputSchema } from "lexicon/types/app/rocksky/scrobble/createScrobble";
import { ScrobbleViewBasic } from "lexicon/types/app/rocksky/scrobble/defs";
import { createAgent } from "lib/agent";
import tables from "schema";
import { SelectUser } from "schema/users";

export default function (server: Server, ctx: Context) {
  const createScrobble = (input, auth: HandlerAuth) =>
    pipe(
      { input, ctx, did: auth.credentials.did },
      withAgent,
      Effect.flatMap(withUser),
      Effect.flatMap(putScrobbleRecord),
      Effect.flatMap(saveIntoDatabase),
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({});
      })
    );
  server.app.rocksky.scrobble.createScrobble({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = await Effect.runPromise(createScrobble(input.body, auth));
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
  did: string;
  agent: Agent;
}): Effect.Effect<
  {
    input: InputSchema;
    ctx: Context;
    did: string;
    agent: Agent;
    user: SelectUser;
  },
  Error
> => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({ user: users[0], ctx, input, agent, did })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const putScrobbleRecord = ({
  input,
  ctx,
  did,
  agent,
}: {
  input: InputSchema;
  ctx: Context;
  did: string;
  agent: Agent;
}) => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to put scrobble record: ${error}`),
  });
};

const saveIntoDatabase = () => {
  return Effect.tryPromise({
    try: async () => {},
    catch: (error) => new Error(`Failed to create scrobble: ${error}`),
  });
};

const presentation = (): Effect.Effect<ScrobbleViewBasic, never> => {
  return Effect.sync(() => ({}));
};
