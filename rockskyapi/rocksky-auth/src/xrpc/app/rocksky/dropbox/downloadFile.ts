import { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/dropbox/downloadFile";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  server.app.rocksky.dropbox.downloadFile({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      download();
      throw new Error("Not implemented yet");
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

const download = () => {
  // Logic to download a file from Dropbox
  return {};
};
