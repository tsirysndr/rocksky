module Rocksky.Typesense.Schema where

import Prelude
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Traversable (for_)
import Effect.Aff (Aff, attempt, throwError)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign (mergeForeign, readIntAt, toForeign)
import Typesense as Typesense

libraryTracksCollection :: String
libraryTracksCollection = "library_tracks"

albumsCollection :: String
albumsCollection = "albums"

artistsCollection :: String
artistsCollection = "artists"

tracksCollection :: String
tracksCollection = "tracks"

usersCollection :: String
usersCollection = "users"

playlistsCollection :: String
playlistsCollection = "playlists"

field :: String -> String -> Foreign
field name type_ = toForeign { name, type: type_ }

optional :: Foreign -> Foreign
optional value = mergeForeign value (toForeign { optional: true })

facet :: Foreign -> Foreign
facet value = mergeForeign value (toForeign { facet: true })

unindexed :: Foreign -> Foreign
unindexed value = mergeForeign value (toForeign { index: false })

librarySchema :: Foreign
librarySchema = toForeign
  { name: libraryTracksCollection
  , default_sorting_field: "uploaded_at"
  , fields:
      [ field "id" "string"
      , facet (field "user_id" "string")
      , unindexed (field "track_id" "string")
      , field "title" "string"
      , field "artist" "string"
      , field "album" "string"
      , field "album_artist" "string"
      , optional (field "genre" "string")
      , optional (field "composer" "string")
      , optional (field "year" "int32")
      , field "duration" "int32"
      , optional (unindexed (field "album_art" "string"))
      , unindexed (field "r2_key" "string")
      , unindexed (field "mime_type" "string")
      , unindexed (field "file_size" "int32")
      , optional (unindexed (field "original_filename" "string"))
      , field "uploaded_at" "int64"
      , optional (field "mb_id" "string")
      , optional (field "track_number" "int32")
      , optional (field "disc_number" "int32")
      ]
  }

searchSchemas :: Array { name :: String, schema :: Foreign }
searchSchemas =
  [ schema albumsCollection [ optional (field "title" "string"), optional (field "artist" "string"), optional (facet (field "year" "int32")) ]
  , schema artistsCollection [ optional (field "name" "string"), optional (field "biography" "string"), optional (facet (field "genres" "string[]")), optional (field "bornIn" "string") ]
  , schema tracksCollection [ optional (field "title" "string"), optional (field "artist" "string"), optional (field "albumArtist" "string"), optional (field "album" "string"), optional (facet (field "genre" "string")), optional (field "composer" "string") ]
  , schema usersCollection [ optional (field "handle" "string"), optional (field "displayName" "string") ]
  , schema playlistsCollection [ optional (field "name" "string"), optional (field "description" "string") ]
  ]
  where
  schema name fields = { name, schema: toForeign { name, enable_nested_fields: true, fields: [ field "id" "string" ] <> fields <> [ field ".*" "auto" ] } }

createIfMissing :: Context -> String -> Foreign -> Aff Unit
createIfMissing ctx name schema = do
  result <- attempt (Typesense.createCollection ctx.typesense schema)
  case result of
    Left err | readIntAt "httpStatus" (errorToForeign err) == Just 409 -> do
      exists <- Typesense.collectionExists ctx.typesense name
      unless exists (throwError err)
    Left err -> throwError err
    Right _ -> pure unit

ensureCollection :: Context -> Aff Unit
ensureCollection ctx = do
  exists <- Typesense.collectionExists ctx.typesense libraryTracksCollection
  unless exists (createIfMissing ctx libraryTracksCollection librarySchema)

ensureSearchCollections :: Context -> Aff Unit
ensureSearchCollections ctx = for_ searchSchemas \{ name, schema } -> do
  exists <- Typesense.collectionExists ctx.typesense name
  unless exists (createIfMissing ctx name schema)

recreateSearchCollections :: Context -> Aff Unit
recreateSearchCollections ctx = for_ searchSchemas \{ name, schema } -> do
  result <- attempt (Typesense.deleteCollection ctx.typesense name)
  case result of
    Left err | readIntAt "httpStatus" (errorToForeign err) /= Just 404 -> throwError err
    _ -> pure unit
  Typesense.createCollection ctx.typesense schema
