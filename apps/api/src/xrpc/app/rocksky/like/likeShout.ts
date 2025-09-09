import type { HandlerAuth } from "@atproto/xrpc-server";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/like/likeShout";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const likeShout = (params, auth: HandlerAuth) =>
    pipe(params, like, presentation);
  server.app.rocksky.like.likeShout({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = likeShout(params, auth);
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

const like = () => {
  // Logic to like a shout
  return {};
};

const presentation = () => {
  // Logic to format the response for presentation
  return {};
};
