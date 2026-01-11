import type { Context } from "context";
import { consola } from "consola";
import { and, asc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { QueryParams } from "lexicon/types/app/rocksky/googledrive/getFiles";
import _ from "lodash";
import * as R from "ramda";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getFiles = (params, auth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      Effect.flatMap(presentation),
      Effect.retry({ times: 3 }),
      Effect.timeout("10 seconds"),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ files: [], directories: [] });
      }),
    );
  server.app.rocksky.googledrive.getFiles({
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
}): Effect.Effect<[Directories, Files], Error> => {
  return Effect.tryPromise({
    try: async () => {
      const parentDirAlias = alias(tables.googleDriveDirectories, "parent_dir");
      const parentAlias = alias(tables.googleDriveDirectories, "parent");
      return Promise.all([
        ctx.db
          .select()
          .from(tables.googleDriveDirectories)
          .leftJoin(
            tables.googleDrive,
            eq(
              tables.googleDrive.id,
              tables.googleDriveDirectories.googleDriveId,
            ),
          )
          .leftJoin(
            tables.users,
            eq(tables.googleDrive.userId, tables.users.id),
          )
          .leftJoin(
            parentAlias,
            eq(parentAlias.id, tables.googleDriveDirectories.parentId),
          )
          .leftJoin(parentDirAlias, eq(parentDirAlias.id, parentAlias.parentId))
          .where(
            and(
              eq(tables.users.did, did),
              or(
                eq(
                  parentAlias.path,
                  _.get(params, "at", "/Music").replace(/\/$/, "").trim(),
                ),
                eq(parentAlias.fileId, _.get(params, "at", "").trim()),
              ),
            ),
          )
          .orderBy(asc(tables.googleDriveDirectories.name))
          .execute(),
        ctx.db
          .select()
          .from(tables.googleDrivePaths)
          .leftJoin(
            parentAlias,
            eq(tables.googleDrivePaths.directoryId, parentAlias.id),
          )
          .leftJoin(parentDirAlias, eq(parentDirAlias.id, parentAlias.parentId))
          .leftJoin(
            tables.googleDrive,
            eq(tables.googleDrive.id, tables.googleDrivePaths.googleDriveId),
          )
          .leftJoin(
            tables.users,
            eq(tables.googleDrive.userId, tables.users.id),
          )
          .where(
            and(
              eq(tables.users.did, did),
              or(
                eq(
                  parentAlias.path,
                  _.get(params, "at", "/Music").replace(/\/$/, "").trim(),
                ),
                eq(parentAlias.fileId, _.get(params, "at", "").trim()),
              ),
            ),
          )
          .orderBy(asc(tables.googleDrivePaths.name))
          .execute(),
      ]);
    },
    catch: (error) => {
      consola.error("Failed to retrieve files:", error);
      return new Error(`Failed to retrieve albums: ${error}`);
    },
  });
};

const presentation = (
  data: [Directories, Files],
): Effect.Effect<any, never> => {
  return Effect.sync(() => ({
    directory: R.omit(
      ["createdAt", "updatedAt", "xataVersion"],
      _.get(data, "0.0.parent", null) || _.get(data, "1.0.parent", null),
    ),
    parentDirectory: R.omit(
      ["createdAt", "updatedAt"],
      _.get(data, "0.0.parent_dir", null) ||
        _.get(data, "1.0.parent_dir", null),
    ),
    directories: data[0].map((item) => ({
      id: item.google_drive_directories.id,
      name: item.google_drive_directories.name,
      fileId: item.google_drive_directories.fileId,
      path: item.google_drive_directories.path,
      parentId: item.google_drive_directories.parentId,
      createdAt: item.google_drive_directories.createdAt.toISOString(),
      updatedAt: item.google_drive_directories.updatedAt.toISOString(),
    })),
    files: data[1].map((item) => ({
      id: item.google_drive_paths.id,
      name: item.google_drive_paths.name,
      fileId: item.google_drive_paths.fileId,
      directoryId: item.google_drive_paths.directoryId,
      trackId: item.google_drive_paths.trackId,
      createdAt: item.google_drive_paths.createdAt.toISOString(),
      updatedAt: item.google_drive_paths.updatedAt.toISOString(),
    })),
  }));
};

type Directories = {
  google_drive_directories: {
    id: string;
    name: string;
    fileId: string;
    path: string;
    parentId: string;
    createdAt: Date;
    updatedAt: Date;
  };
}[];

type Files = {
  google_drive_paths: {
    id: string;
    name: string;
    fileId: string;
    directoryId: string;
    trackId?: string;
    createdAt: Date;
    updatedAt: Date;
  };
}[];
