-- | Uploaded-library indexing, deletion and search (`src/typesense/library.ts`).
module Rocksky.Typesense.Library (removeLibraryTrack, indexLibraryTrack, searchLibraryTracks, searchLibraryTracksNumber) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.JSDate (fromTime)
import Data.Int as Int
import Data.Number as Number
import Data.Nullable (notNull, toNullable)
import Foreign (Foreign)
import Effect.Aff (Aff, attempt, throwError)
import Rocksky.Context (Context)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign (readIntAt, readArrayAt, readNumberAt, readStringAt, path, toForeign, unsafeFromForeign)
import Rocksky.Lib.JsonRecord (field)
import Rocksky.Typesense.Retry (withTypesenseRetry)
import Typesense as Typesense

removeLibraryTrack :: Context -> String -> Aff Unit
removeLibraryTrack ctx uploadId = do
  result <- attempt $ withTypesenseRetry $
    Typesense.deleteDocument ctx.typesense "library_tracks" uploadId
  case result of
    Right _ -> pure unit
    Left err
      | readIntAt "httpStatus" (errorToForeign err) == Just 404 -> pure unit
      | otherwise -> throwError err

indexLibraryTrack :: Context -> Foreign -> Aff Unit
indexLibraryTrack ctx doc = withTypesenseRetry (Typesense.upsertDocument ctx.typesense "library_tracks" doc)

searchLibraryTracks :: Context -> { query :: String, userId :: String, limit :: Int, offset :: Int } -> Aff (Array Foreign)
searchLibraryTracks ctx p = searchLibraryTracksNumber ctx { query: p.query, userId: p.userId, limit: Int.toNumber p.limit, offset: Int.toNumber p.offset }

searchLibraryTracksNumber :: Context -> { query :: String, userId :: String, limit :: Number, offset :: Number } -> Aff (Array Foreign)
searchLibraryTracksNumber ctx params = do
  let perPage = min params.limit 200.0
  result <- Typesense.search ctx.typesense "library_tracks"
    ( (Typesense.defaultSearchParams (if params.query == "" then "*" else params.query) "title,artist,album,album_artist,genre,composer")
        { filter_by = notNull ("user_id:=" <> params.userId)
        , per_page = notNull (unsafeFromForeign (toForeign perPage))
        , page = notNull (unsafeFromForeign (toForeign (Number.floor (params.offset / perPage) + 1.0)))
        , sort_by = notNull (if params.query == "" then "uploaded_at:desc" else "_text_match:desc,uploaded_at:desc")
        }
    )
  pure $ map present (fromMaybe [] (readArrayAt "hits" result))
  where
  present hit =
    let
      doc = fromMaybe (toForeign {}) (path "document" hit)
      string key = toNullable (readStringAt key doc)
      int key = toNullable (readIntAt key doc)
    in
      toForeign
        { upload:
            { id: field "id" doc
            , userId: field "user_id" doc
            , trackId: field "track_id" doc
            , r2Key: field "r2_key" doc
            , mimeType: field "mime_type" doc
            , fileSize: field "file_size" doc
            , originalFilename: string "original_filename"
            , uploadedAt: fromTime (fromMaybe 0.0 (readNumberAt "uploaded_at" doc))
            }
        , track:
            { id: field "track_id" doc
            , title: field "title" doc
            , artist: field "artist" doc
            , albumArtist: field "album_artist" doc
            , album: field "album" doc
            , duration: field "duration" doc
            , genre: string "genre"
            , composer: string "composer"
            , albumArt: string "album_art"
            , trackNumber: int "track_number"
            , discNumber: int "disc_number"
            , mbId: string "mb_id"
            , year: int "year"
            }
        , albumReleaseDate: toNullable (Nothing :: Maybe String)
        , albumYear: int "year"
        }
