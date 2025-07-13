import { Context } from "context";
import { and, eq } from "drizzle-orm";
import { Effect, pipe } from "effect";
import { Server } from "lexicon";
import { QueryParams } from "lexicon/types/app/rocksky/googledrive/getFiles";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const getFiles = (params, auth) =>
    pipe(
      { params, ctx, did: auth.credentials?.did },
      retrieve,
      presentation,
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
    try: async () =>
      ctx.db
        .select()
        .from(tables.googleDriveDirectories)
        .leftJoin(
          tables.googleDrive,
          eq(tables.googleDrive.id, tables.googleDriveDirectories.googleDriveId)
        )
        .leftJoin(tables.users, eq(tables.googleDrive.userId, tables.users.id))
        .where(
          and(
            eq(tables.users.did, did),
            eq(tables.googleDriveDirectories.path, params.at)
          )
        )
        .execute(),
    catch: (error) => {
      console.error("Failed to retrieve files:", error);
      return new Error(`Failed to retrieve albums: ${error}`);
    },
  });
};

const presentation = (data) => {
  return Effect.sync(() => ({
    files: data.map((item) => ({
      id: item.google_drive_directories.id,
      name: item.google_drive_directories.name,
      fileId: item.google_drive_directories.fileId,
      path: item.google_drive_directories.path,
      parentId: item.google_drive_directories.parentId,
      createdAt: item.google_drive_directories.xata_createdat,
      updatedAt: item.google_drive_directories.xata_updatedat,
    })),
  }));
};
