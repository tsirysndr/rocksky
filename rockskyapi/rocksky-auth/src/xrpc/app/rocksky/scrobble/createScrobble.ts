import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { InputSchema } from "lexicon/types/app/rocksky/scrobble/createScrobble";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const createScrobble = (input, auth: HandlerAuth) =>
    pipe(input, create, presentation);
  server.app.rocksky.scrobble.createScrobble({
    auth: ctx.authVerifier,
    handler: async ({ input, auth }) => {
      const result = createScrobble(input, auth);
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const getCurrentUser = ({
  params,
  ctx,
  did,
}: {
  params: InputSchema;
  ctx: Context;
  did?: string;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.users)
        .where(eq(tables.users.did, did))
        .execute()
        .then((users) => ({ user: users[0], ctx, params })),
    catch: (error) => new Error(`Failed to retrieve current user: ${error}`),
  });
};

const create = () => {
  // Logic to create a scrobble
  return {};
};

const presentation = () => {
  // Logic to format the scrobble for presentation
  return {};
};
