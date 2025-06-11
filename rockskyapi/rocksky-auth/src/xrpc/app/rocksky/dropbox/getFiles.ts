import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/dropbox/getFiles";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getFiles = (params, auth: HandlerAuth) =>
    pipe(params, retrieve, presentation);
  server.app.rocksky.dropbox.getFiles({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = getFiles(params, auth);
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

const retrieve = () => {
  // Logic to retrieve files from Dropbox
  return [];
};

const presentation = (files) => {
  // Logic to format the files for presentation
  return {};
};
