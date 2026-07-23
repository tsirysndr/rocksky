import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { consola } from "consola";
import type { Context } from "context";
import { and, eq, inArray } from "drizzle-orm";
import tables from "schema";
import type { SelectUserUpload } from "schema/user-uploads";
import users from "schema/users";
import { resolveStorageClient } from "storage/app";
import { removeLibraryTrack } from "typesense/library";

/** Raised when an authenticated DID has no matching Rocksky user row. */
export class UnknownUserError extends Error {
  constructor(did: string) {
    super(`No user found for DID ${did}`);
    this.name = "UnknownUserError";
  }
}

/**
 * Resolve the authenticated DID (from the caller's JWT) to their user id.
 * Identity always comes from the token — callers never pass a user id.
 */
async function resolveUserId(ctx: Context, did: string): Promise<string> {
  const row = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) throw new UnknownUserError(did);
  return row.id;
}

/**
 * Delete a set of the caller's uploads: their storage objects, their
 * `user_uploads` rows, and their Typesense documents.
 *
 * Deliberately leaves the shared `tracks`/`albums`/`artists` rows and their
 * join tables (plus cover art) untouched — those are deduped across users and
 * referenced by scrobble history. This is the single source of truth for
 * upload deletion, shared by the REST routes and the XRPC methods.
 *
 * `userId` is the already-resolved, token-derived owner of these uploads.
 * Returns the number of `user_uploads` rows deleted.
 */
export async function purgeUploads(
  ctx: Context,
  userId: string,
  uploads: SelectUserUpload[],
): Promise<number> {
  if (uploads.length === 0) return 0;

  // Best-effort object deletes — a storage failure shouldn't strand the DB
  // row, matching the prior REST behaviour.
  await Promise.all(
    uploads.map(async (upload) => {
      try {
        const { client, bucket } = await resolveStorageClient(
          userId,
          upload.storageProviderId ?? null,
        );
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: upload.r2Key }),
        );
      } catch (e) {
        consola.warn(
          `[uploads] failed to delete object ${upload.r2Key} from storage`,
          e,
        );
      }
    }),
  );

  await ctx.db.delete(tables.userUploads).where(
    inArray(
      tables.userUploads.id,
      uploads.map((u) => u.id),
    ),
  );

  for (const upload of uploads) {
    removeLibraryTrack(upload.id).catch((e) =>
      consola.warn("[typesense] remove failed:", e),
    );
  }

  return uploads.length;
}

/**
 * Delete the authenticated user's upload of a single track, identified by the
 * track's xata_id (the id navidrome/library exposes as the song id). The owner
 * is resolved from `did` (the token), never supplied by the caller.
 */
export async function deleteUploadsForTrack(
  ctx: Context,
  did: string,
  trackId: string,
): Promise<number> {
  const userId = await resolveUserId(ctx, did);
  const uploads = await ctx.db
    .select()
    .from(tables.userUploads)
    .where(
      and(
        eq(tables.userUploads.trackId, trackId),
        eq(tables.userUploads.userId, userId),
      ),
    );
  return purgeUploads(ctx, userId, uploads);
}

/**
 * Delete every upload owned by the authenticated user that belongs to an
 * album, identified by the album's xata_id (the id navidrome/library exposes
 * as the album id). The owner is resolved from `did` (the token).
 */
export async function deleteUploadsForAlbumId(
  ctx: Context,
  did: string,
  albumId: string,
): Promise<number> {
  const userId = await resolveUserId(ctx, did);
  const rows = await ctx.db
    .select({ upload: tables.userUploads })
    .from(tables.userUploads)
    .innerJoin(
      tables.albumTracks,
      eq(tables.albumTracks.trackId, tables.userUploads.trackId),
    )
    .where(
      and(
        eq(tables.albumTracks.albumId, albumId),
        eq(tables.userUploads.userId, userId),
      ),
    );
  return purgeUploads(
    ctx,
    userId,
    rows.map((r) => r.upload),
  );
}
