module Rocksky.Typesense.Search where

import Prelude
import Data.Array (concat, foldl, mapWithIndex)
import Data.JSDate (getTime, now)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (notNull)
import Effect.Aff (Aff, attempt, throwError)
import Data.Either (Either(..))
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Typesense.Schema (ensureSearchCollections)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (mergeForeign, path, readArrayAt, readIntAt, toForeign)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Playlists (SelectPlaylist)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Typesense.Retry (withTypesenseRetry)
import Typesense as Typesense
import Data.Array as Array

searchCollections :: Array String
searchCollections = [ "albums", "artists", "tracks", "users", "playlists" ]

upsertMany :: Context -> String -> Array Foreign -> Aff Unit
upsertMany _ _ [] = pure unit
upsertMany ctx collection docs = do
  result <- attempt importDocs
  case result of
    Left err | readIntAt "httpStatus" (errorToForeign err) == Just 404 -> do
      ensureSearchCollections ctx
      importDocs
    Left err -> throwError err
    Right _ -> pure unit
  where
  importDocs = void $ withTypesenseRetry $ Typesense.importDocuments ctx.typesense collection docs "upsert"

indexAlbums :: Context -> Array SelectAlbum -> Aff Unit
indexAlbums ctx = upsertMany ctx "albums" <<< map toForeign

indexArtists :: Context -> Array SelectArtist -> Aff Unit
indexArtists ctx = upsertMany ctx "artists" <<< map toForeign

indexTracks :: Context -> Array SelectTrack -> Aff Unit
indexTracks ctx = upsertMany ctx "tracks" <<< map toForeign

indexUsers :: Context -> Array SelectUser -> Aff Unit
indexUsers ctx = upsertMany ctx "users" <<< map toForeign

indexPlaylists :: Context -> Array SelectPlaylist -> Aff Unit
indexPlaylists ctx = upsertMany ctx "playlists" <<< map toForeign

type FederatedSearchResults = { hits :: Array Foreign, processingTimeMs :: Number, limit :: Int, offset :: Int, estimatedTotalHits :: Int }

federatedSearch :: Context -> String -> Int -> Aff FederatedSearchResults
federatedSearch ctx query perCollectionLimit = do
  started <- liftEffect (getTime <$> now)
  results <- Typesense.multiSearch ctx.typesense (map search searchCollections)
  finished <- liftEffect (getTime <$> now)
  let groups = mapWithIndex present results
  pure { hits: concat (map _.hits groups), processingTimeMs: finished - started, limit: perCollectionLimit * Array.length searchCollections, offset: 0, estimatedTotalHits: foldl (\sum result -> sum + result.found) 0 groups }
  where
  queryBy "albums" = "title,artist"
  queryBy "artists" = "name,biography"
  queryBy "tracks" = "title,artist,albumArtist,album,composer"
  queryBy "users" = "handle,displayName"
  queryBy _ = "name,description"
  search collection = (Typesense.defaultSearchParams query (queryBy collection)) { collection = notNull collection, per_page = notNull perCollectionLimit, page = notNull 1, prioritize_exact_match = notNull true }
  present index result = case path "error" result of
    Just _ -> { hits: [], found: 0 }
    Nothing ->
      { found: fromMaybe 0 (readIntAt "found" result)
      , hits: map (\hit -> mergeForeign (fromMaybe (toForeign {}) (path "document" hit)) (toForeign { _federation: { indexUid: fromMaybe "" (Array.index searchCollections index) } })) (fromMaybe [] (readArrayAt "hits" result))
      }
