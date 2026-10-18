module Rocksky.Scripts.TypesenseImport (main, importCollection, importLibraryTracks, libraryDocument, options) where

import Prelude
import Consola as Log
import Control.Parallel (parTraverse)
import Data.Array as A
import Data.Either (Either(..), isRight)
import Data.Int as Int
import Data.JSDate (getTime)
import Data.Maybe (fromMaybe)
import Drizzle.Builder (innerJoin, limit, offset, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Dialect (Postgres)
import Drizzle.Schema (Table, tableSQL, toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.UserUploads (SelectUserUpload)
import Rocksky.Scripts.Common (exit, runScript, scriptArgs)
import Rocksky.Typesense.Library (indexLibraryTrack)
import Rocksky.Typesense.Schema (ensureCollection, ensureSearchCollections, recreateSearchCollections)
import Rocksky.Typesense.Search as Search

type Counts = { imported :: Int, failed :: Int }
type LibraryRow = { upload :: SelectUserUpload, track :: SelectTrack }

options :: Array String -> { includeSearch :: Boolean, includeLibrary :: Boolean, reset :: Boolean }
options args =
  let only = A.elemIndex "--only" args >>= \i -> A.index args (i + 1)
      libraryOnly = fromMaybe "" only == "library"
  in { includeSearch: not libraryOnly, includeLibrary: libraryOnly || A.elem "--library" args, reset: A.elem "--reset" args }

progress :: String -> Int -> Int -> Counts -> Effect Unit
progress label done total counts = Log.info ("  " <> label <> " " <> show done <> "/" <> show total <> " [" <> show (Int.round (Int.toNumber done / Int.toNumber total * 100.0)) <> "%] — " <> show counts.imported <> " ok, " <> show counts.failed <> " failed")

importCollection :: forall a. String -> Int -> (Int -> Int -> Aff (Array a)) -> (Array a -> Aff Unit) -> Aff Counts
importCollection label total fetch index = do
  liftEffect (Log.info ("Importing " <> show total <> " " <> label))
  if total == 0 then pure { imported: 0, failed: 0 } else do
    let page at counts
          | at >= total = pure counts
          | otherwise = do
              rows <- fetch at 500
              if A.null rows then pure counts else do
                result <- attempt (index rows)
                next <- case result of
                  Right _ -> pure (counts { imported = counts.imported + A.length rows })
                  Left e -> do
                    liftEffect (Log.warnF ("  Batch failed at offset " <> show at <> ":") [errorToForeign e])
                    pure (counts { failed = counts.failed + A.length rows })
                liftEffect (progress label (min (at + A.length rows) total) total next)
                page (at + 500) next
    counts <- page 0 { imported: 0, failed: 0 }
    liftEffect (Log.success (label <> ": " <> show counts.imported <> " imported, " <> show counts.failed <> " failed"))
    pure counts

importTable :: forall cols row. Context -> String -> Table Postgres cols -> (Array (Record row) -> Aff Unit) -> Aff Unit
importTable ctx label table index = do
  counts <- run ctx.db (selectFieldsFrom { value: SQL.count } table) :: Aff (Array { value :: Int })
  let total = fromMaybe 0 (_.value <$> A.head counts)
  void (importCollection label total (\at size -> run ctx.db (selectFrom table # limit size # offset at)) index)

libraryDocument :: LibraryRow -> Foreign
libraryDocument { upload, track } = F.omitNulls (F.toForeign
  { id: upload.id, user_id: upload.userId, track_id: track.id, title: track.title, artist: track.artist, album: track.album
  , album_artist: fromMaybe track.artist (F.readStringAt "albumArtist" (F.toForeign track))
  , genre: track.genre, composer: track.composer, year: fromMaybe F.undefined (F.path "year" (F.toForeign track)), duration: track.duration, album_art: track.albumArt
  , r2_key: upload.r2Key, mime_type: upload.mimeType, file_size: upload.fileSize, original_filename: upload.originalFilename
  , uploaded_at: getTime upload.uploadedAt, mb_id: track.mbId, track_number: track.trackNumber, disc_number: track.discNumber })

importLibraryTracks :: Context -> (Foreign -> Aff Unit) -> Aff Counts
importLibraryTracks ctx index = do
  liftEffect (Log.start "Counting uploads...")
  counts <- run ctx.db (selectFieldsFrom { value: SQL.count } T.userUploads) :: Aff (Array { value :: Int })
  let total = fromMaybe 0 (_.value <$> A.head counts)
  liftEffect (Log.info ("Found " <> show total <> " uploads to import"))
  if total == 0 then pure { imported: 0, failed: 0 } else do
    let page at state
          | at >= total = pure state
          | otherwise = do
              rows <- run ctx.db (selectFieldsFrom { upload: tableSQL T.userUploads, track: tableSQL T.tracks } T.userUploads
                # innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id))
                # orderBy [toSQL T.userUploadsC.uploadedAt] # limit 500 # offset at) :: Aff (Array LibraryRow)
              if A.null rows then pure state else do
                results <- parTraverse (attempt <<< index <<< libraryDocument) rows
                let succeeded = A.length (A.filter isRight results)
                let next = { imported: state.imported + succeeded, failed: state.failed + A.length rows - succeeded }
                liftEffect (progress "library_tracks" (min (at + A.length rows) total) total next)
                page (at + 500) next
    result <- page 0 { imported: 0, failed: 0 }
    liftEffect (Log.success ("library_tracks: " <> show result.imported <> " indexed, " <> show result.failed <> " failed"))
    pure result

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  let opts = options args
  when opts.includeSearch do
    if opts.reset then do
      liftEffect (Log.start "Recreating Typesense search collections...")
      recreateSearchCollections ctx
    else do
      liftEffect (Log.start "Ensuring Typesense search collections exist...")
      ensureSearchCollections ctx
    liftEffect (Log.success "Search collections ready")
    importTable ctx "albums" T.albums (Search.indexAlbums ctx)
    importTable ctx "artists" T.artists (Search.indexArtists ctx)
    importTable ctx "tracks" T.tracks (Search.indexTracks ctx)
    importTable ctx "users" T.users (Search.indexUsers ctx)
    importTable ctx "playlists" T.playlists (Search.indexPlaylists ctx)
  when opts.includeLibrary do
    liftEffect (Log.start "Ensuring library_tracks collection exists...")
    ensureCollection ctx
    liftEffect (Log.success "library_tracks collection ready")
    void (importLibraryTracks ctx (indexLibraryTrack ctx))
  liftEffect (Log.success "Typesense import complete.")
  exit 0
