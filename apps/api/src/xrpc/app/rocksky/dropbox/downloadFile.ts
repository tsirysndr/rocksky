import type { Context } from "context";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/dropbox/downloadFile";
import { dbQuery } from "lib/dbQuery";
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
  return dbQuery("Failed to retrieve current user", async (db) =>
    db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, did))
      .execute()
      .then((users) => ({ user: users[0], ctx, params })),
  );
};

const download = () => {
  // Logic to download a file from Dropbox
  return {};
};
