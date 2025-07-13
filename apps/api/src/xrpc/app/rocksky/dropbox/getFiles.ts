import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/dropbox/getFiles";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getFiles = (params, auth: HandlerAuth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        console.error(err);
        return Effect.succeed({ artists: [] });
      })
    );
  server.app.rocksky.dropbox.getFiles({
    auth: ctx.authVerifier,
    handler: async ({ params, auth }) => {
      const result = await Effect.runPromise(getFiles(params, auth));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
  did,
}: {
  params: QueryParams;
  ctx: Context;
  did: string;
}) => {
  return Effect.tryPromise({
    try: async () =>
      ctx.db
        .select()
        .from(tables.dropboxDirectories)
        .leftJoin(
          tables.dropbox,
          eq(tables.dropbox.id, tables.dropboxDirectories.dropboxId)
        )
        .leftJoin(tables.users, eq(tables.dropbox.userId, tables.users.id))
        .leftJoin(
          alias(tables.dropboxDirectories, "parent"),
          eq(tables.dropboxDirectories.id, tables.dropboxDirectories.parentId)
        )
        .where(
          and(
            eq(tables.users.did, did),
            eq(alias(tables.dropboxDirectories, "parent").path, params.at)
          )
        )
        .execute(),
    catch: (error) => {
      console.error("Failed to retrieve files:", error);
      return new Error(`Failed to retrieve files: ${error}`);
    },
  });
};

const presentation = (data) => {
  return Effect.sync(() => ({
    files: data.map((item) => ({
      id: item.dropbox_directories.id,
      name: item.dropbox_directories.name,
      fileId: item.dropbox_directories.fileId,
      path: item.dropbox_directories.path,
      parentId: item.dropbox_directories.parentId,
      createdAt: item.dropbox_directories.xata_createdat,
      updatedAt: item.dropbox_directories.xata_updatedat,
    })),
  }));
};
