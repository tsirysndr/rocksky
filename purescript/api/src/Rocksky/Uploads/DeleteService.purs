-- | The single source of truth for upload deletion (`src/uploads/delete.service.ts`),
-- | shared by the REST routes and the XRPC methods.
module Rocksky.Uploads.DeleteService
  ( unknownUserError
  , isUnknownUserError
  , purgeUploads
  , deleteUploadsForTrack
  , deleteUploadsForAlbumId
  ) where

import Prelude

import Aws.S3 as S3
import Consola as Consola
import Data.Array (head, length)
import Data.Maybe (Maybe(..))
import Data.Nullable (toMaybe)
import Data.Traversable (for_)
import Control.Parallel (parTraverse_)
import Drizzle.Builder (innerJoin, limit, run, runDelete, selectFieldsFrom, selectFrom, deleteFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect.Aff (Aff, Error, attempt, throwError)
import Effect.Class (liftEffect)
import Data.Either (Either(..))
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (forkAndForget)
import Rocksky.Lib.Error (errorName, errorToForeign)
import Rocksky.Schema as T
import Rocksky.Schema.UserUploads (SelectUserUpload)
import Rocksky.Storage.App (resolveStorageClient)
import Rocksky.Typesense.Library (removeLibraryTrack)

foreign import mkUnknownUserError :: String -> String -> Error

-- | Raised when an authenticated DID has no matching Rocksky user row
-- | (`err.name === "UnknownUserError"`, `err.did`).
unknownUserError :: String -> Error
unknownUserError did = mkUnknownUserError did ("No user found for DID " <> did)

-- | `err instanceof UnknownUserError`.
isUnknownUserError :: Error -> Boolean
isUnknownUserError e = errorName e == "UnknownUserError"

-- | Resolve the authenticated DID (from the caller's JWT) to their user id.
-- | Identity always comes from the token — callers never pass a user id.
resolveUserId :: Context -> String -> Aff String
resolveUserId ctx did = do
  rows :: Array { id :: String } <- run ctx.db
    ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did))
        # limit 1
    )
  case head rows of
    Nothing -> throwError (unknownUserError did)
    Just row -> pure row.id

-- | Delete a set of the caller's uploads: their storage objects, their
-- | `user_uploads` rows, and their Typesense documents.
-- |
-- | Deliberately leaves the shared `tracks`/`albums`/`artists` rows and their
-- | join tables (plus cover art) untouched — those are deduped across users and
-- | referenced by scrobble history.
-- |
-- | `userId` is the already-resolved, token-derived owner of these uploads.
-- | Returns the number of `user_uploads` rows deleted.
purgeUploads :: Context -> String -> Array SelectUserUpload -> Aff Int
purgeUploads _ _ [] = pure 0
purgeUploads ctx userId uploads = do
  -- Best-effort object deletes — a storage failure shouldn't strand the DB
  -- row, matching the prior REST behaviour.
  uploads # parTraverse_ \upload -> do
    r <- attempt do
      { client, bucket } <- resolveStorageClient ctx userId (toMaybe upload.storageProviderId)
      S3.deleteObject client bucket upload.r2Key
    case r of
      Left e -> liftEffect (Consola.warnF ("[uploads] failed to delete object " <> upload.r2Key <> " from storage") [ errorToForeign e ])
      Right _ -> pure unit

  runDelete ctx.db
    ( deleteFrom T.userUploads
        # where_ (SQL.inArray (toSQL T.userUploadsC.id) (map (SQL.string <<< _.id) uploads))
    )

  for_ uploads \upload ->
    forkAndForget do
      r <- attempt (removeLibraryTrack ctx upload.id)
      case r of
        Left e -> liftEffect (Consola.warnF "[typesense] remove failed:" [ errorToForeign e ])
        Right _ -> pure unit

  pure (length uploads)

-- | Delete the authenticated user's upload of a single track, identified by the
-- | track's xata_id (the id navidrome/library exposes as the song id). The owner
-- | is resolved from `did` (the token), never supplied by the caller.
deleteUploadsForTrack :: Context -> String -> String -> Aff Int
deleteUploadsForTrack ctx did trackId = do
  userId <- resolveUserId ctx did
  uploads :: Array SelectUserUpload <- run ctx.db
    ( selectFrom T.userUploads
        # where_
            ( SQL.and
                (SQL.eq (toSQL T.userUploadsC.trackId) (SQL.string trackId))
                (SQL.eq (toSQL T.userUploadsC.userId) (SQL.string userId))
            )
    )
  purgeUploads ctx userId uploads

-- | Delete every upload owned by the authenticated user that belongs to an
-- | album, identified by the album's xata_id (the id navidrome/library exposes
-- | as the album id). The owner is resolved from `did` (the token).
deleteUploadsForAlbumId :: Context -> String -> String -> Aff Int
deleteUploadsForAlbumId ctx did albumId = do
  userId <- resolveUserId ctx did
  rows :: Array { upload :: SelectUserUpload } <- run ctx.db
    ( selectFieldsFrom { upload: tableSQL T.userUploads } T.userUploads
        # innerJoin T.albumTracks (SQL.eq (toSQL T.albumTracksC.trackId) (toSQL T.userUploadsC.trackId))
        # where_
            ( SQL.and
                (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string albumId))
                (SQL.eq (toSQL T.userUploadsC.userId) (SQL.string userId))
            )
    )
  purgeUploads ctx userId (map _.upload rows)
