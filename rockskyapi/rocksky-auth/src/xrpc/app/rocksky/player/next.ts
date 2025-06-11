import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/player/next";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const next = (params, auth: HandlerAuth) =>
    pipe(params, handleNext, presentation);
  server.app.rocksky.player.next({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = next(params, auth);
    },
  });
}

const getCurrentUser = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
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

const handleNext = (params) => {};

const presentation = () => {};
