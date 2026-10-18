module Rocksky.Scripts.SyncLibrary (main, synchronize) where

import Prelude
import Consola as Log
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.Traversable (for_)
import Drizzle.Builder (insert, leftJoin, limit, offset, run, runInsert, selectFieldsFrom, selectFrom, onConflictDoNothing)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Scripts.Common (exit, runScript)

synchronize :: Context -> Aff Unit
synchronize ctx = do
  counts <- run ctx.db (selectFieldsFrom { value: SQL.count } T.tracks) :: Aff (Array { value :: Int })
  let total = fromMaybe 0 (_.value <$> A.head counts)
  liftEffect (Log.info ("Total tracks to process: " <> show total))
  let page at = when (at < total) do
        liftEffect (Log.info ("Processing tracks: " <> show at <> " to " <> show (at + 100)))
        tracks <- run ctx.db (selectFrom T.tracks # limit 100 # offset at) :: Aff (Array SelectTrack)
        for_ tracks \track -> case toMaybe track.artistUri, toMaybe track.albumUri of
          Just artistUri, Just albumUri | artistUri /= "" && albumUri /= "" -> do
            found <- run ctx.db (selectFrom T.artistAlbums
              # leftJoin T.artists (SQL.eq (toSQL T.artistAlbumsC.artistId) (toSQL T.artistsC.id))
              # leftJoin T.albums (SQL.eq (toSQL T.artistAlbumsC.albumId) (toSQL T.albumsC.id))
              # where_ (SQL.and (SQL.eq (toSQL T.artistsC.uri) (SQL.string artistUri)) (SQL.eq (toSQL T.albumsC.uri) (SQL.string albumUri))) # limit 1) :: Aff (Array {})
            when (A.null found) do
              liftEffect (Log.info ("Creating artist-album relationship for track: " <> F.stringValue (F.toForeign track.uri)))
              related <- sequential $ { artists: _, albums: _ }
                <$> parallel (run ctx.db (selectFrom T.artists # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string artistUri)) # limit 1) :: Aff (Array SelectArtist))
                <*> parallel (run ctx.db (selectFrom T.albums # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string albumUri)) # limit 1) :: Aff (Array SelectAlbum))
              case A.head related.artists, A.head related.albums of
                Just artist, Just album -> runInsert ctx.db (insert T.artistAlbums [{ artistId: artist.id, albumId: album.id }] # onConflictDoNothing)
                _, _ -> liftEffect do
                  Log.error ("Artist-album relationship already exists for track: " <> F.stringValue (F.toForeign track.uri))
                  Log.infoF "artist/album" [F.toForeign related]
          _, _ -> liftEffect do
            -- Source logs deletion but only skips; there is no delete query.
            Log.info ("Deleting album-track relationship for track: " <> F.stringValue (F.toForeign track.uri))
            Log.infoF "artistUri/albumUri" [F.toForeign track.artistUri, F.toForeign track.albumUri]
        page (at + 100)
  page 0

main :: Effect Unit
main = runScript do
  ctx <- createContext
  synchronize ctx
  exit 0
