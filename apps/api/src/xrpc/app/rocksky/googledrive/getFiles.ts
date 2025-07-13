import { Context } from "context";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/googledrive/getFiles";
import _ from "lodash";
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
        console.error(err);
        return Effect.succeed({ artists: [] });
      })
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
}) => {
  return Effect.tryPromise({
    try: async () => {
      const parentAlias = alias(tables.googleDriveDirectories, "parent");
      return Promise.all([
        ctx.db
          .select()
          .from(tables.googleDriveDirectories)
          .leftJoin(
            tables.googleDrive,
            eq(
              tables.googleDrive.id,
              tables.googleDriveDirectories.googleDriveId
            )
          )
          .leftJoin(
            tables.users,
            eq(tables.googleDrive.userId, tables.users.id)
          )
          .leftJoin(
            parentAlias,
            eq(parentAlias.id, tables.googleDriveDirectories.parentId)
          )
          .where(
            and(
              eq(tables.users.did, did),
              eq(parentAlias.path, _.get(params, "at", "/Music"))
            )
          )
          .execute(),
        ctx.db
          .select()
          .from(tables.googleDrivePaths)
          .leftJoin(
            tables.googleDriveDirectories,
            eq(
              tables.googleDrivePaths.directoryId,
              tables.googleDriveDirectories.id
            )
          )
          .leftJoin(
            tables.googleDrive,
            eq(tables.googleDrive.id, tables.googleDrivePaths.googleDriveId)
          )
          .leftJoin(
            tables.users,
            eq(tables.googleDrive.userId, tables.users.id)
          )
          .where(
            and(
              eq(tables.users.did, did),
              eq(
                tables.googleDriveDirectories.path,
                _.get(params, "at", "/Music")
              )
            )
          )
          .execute(),
      ]);
    },
    catch: (error) => {
      console.error("Failed to retrieve files:", error);
      return new Error(`Failed to retrieve albums: ${error}`);
    },
  });
};

const presentation = (data) => {
  console.log(data[0]);
  console.log(data[1]);
  return Effect.sync(() => ({
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
