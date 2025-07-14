import { HandlerAuth } from "@atproto/xrpc-server";
import { Context } from "context";
import { and, asc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/dropbox/getFiles";
import _ from "lodash";
import * as R from "ramda";
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
        return Effect.succeed({ files: [], directories: [] });
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
    try: async () => {
      const parentDirAlias = alias(tables.dropboxDirectories, "parent_dir");
      const parentAlias = alias(tables.dropboxDirectories, "parent");
      return Promise.all([
        ctx.db
          .select()
          .from(tables.dropboxDirectories)
          .leftJoin(
            tables.dropbox,
            eq(tables.dropbox.id, tables.dropboxDirectories.dropboxId)
          )
          .leftJoin(tables.users, eq(tables.dropbox.userId, tables.users.id))
          .leftJoin(
            parentAlias,
            eq(parentAlias.id, tables.dropboxDirectories.parentId)
          )
          .leftJoin(parentDirAlias, eq(parentDirAlias.id, parentAlias.parentId))
          .where(
            and(
              eq(tables.users.did, did),
              or(
                eq(
                  parentAlias.path,
                  _.get(params, "at", "/Music").replace(/\/$/, "").trim()
                ),
                eq(parentAlias.fileId, _.get(params, "at", "").trim())
              )
            )
          )
          .orderBy(asc(tables.dropboxDirectories.name))
          .execute(),
        ctx.db
          .select()
          .from(tables.dropboxPaths)
          .leftJoin(
            parentAlias,
            eq(parentAlias.id, tables.dropboxPaths.directoryId)
          )
          .leftJoin(parentDirAlias, eq(parentDirAlias.id, parentAlias.parentId))
          .leftJoin(
            tables.dropbox,
            eq(tables.dropbox.id, tables.dropboxPaths.dropboxId)
          )
          .leftJoin(tables.users, eq(tables.dropbox.userId, tables.users.id))
          .where(
            and(
              eq(tables.users.did, did),
              or(
                eq(
                  parentAlias.path,
                  _.get(params, "at", "/Music").replace(/\/$/, "").trim()
                ),
                eq(parentAlias.fileId, _.get(params, "at", "").trim())
              )
            )
          )
          .orderBy(asc(tables.dropboxPaths.name))
          .execute(),
      ]);
    },
    catch: (error) => {
      console.error("Failed to retrieve files:", error);
      return new Error(`Failed to retrieve files: ${error}`);
    },
  });
};

const presentation = (data) => {
  return Effect.sync(() => ({
    directory: R.omit(
      ["createdAt", "updatedAt", "xataVersion"],
      _.get(data, "0.0.parent", null) || _.get(data, "1.0.parent", null)
    ),
    parentDirectory: R.omit(
      ["createdAt", "updatedAt"],
      _.get(data, "0.0.parent_dir", null) || _.get(data, "1.0.parent_dir", null)
    ),
    directories: data[0].map((item) => ({
      id: item.dropbox_directories.id,
      name: item.dropbox_directories.name,
      fileId: item.dropbox_directories.fileId,
      path: item.dropbox_directories.path,
      parentId: item.dropbox_directories.parentId,
      createdAt: item.dropbox_directories.createdAt.toISOString(),
      updatedAt: item.dropbox_directories.updatedAt.toISOString(),
    })),
    files: data[1].map((item) => ({
      id: item.dropbox_paths.id,
      name: item.dropbox_paths.name,
      fileId: item.dropbox_paths.fileId,
      directoryId: item.dropbox_paths.directoryId,
      trackId: item.dropbox_paths.trackId,
      createdAt: item.dropbox_paths.createdAt.toISOString(),
      updatedAt: item.dropbox_paths.updatedAt.toISOString(),
    })),
  }));
};
