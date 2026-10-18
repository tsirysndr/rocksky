module Rocksky.Subscribers.Track (onNewTrack, handle) where

import Prelude
import Consola as Log
import Control.Parallel (parallel, sequential, parTraverse)
import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (fromMaybe)
import Data.Traversable (for_)
import Drizzle.Builder (run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (Subscription)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (path, toForeign, undefined)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Subscribers.Consumer (start)
import Rocksky.Typesense.Search (indexTracks, indexArtists, indexAlbums)

onNewTrack :: Context -> Effect Subscription
onNewTrack ctx = start ctx "rocksky.track" (handle ctx)

handle :: Context -> Foreign -> Aff Unit
handle ctx payload = do
  let id key = SQL.param (fromMaybe undefined (path key payload))
  rows :: { tracks :: Array SelectTrack, artists :: Array SelectArtist, albums :: Array SelectAlbum } <- sequential $
    { tracks: _, artists: _, albums: _ }
      <$> parallel (run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.id) (id "track.xata_id"))))
      <*> parallel (run ctx.db (selectFrom T.artists # where_ (SQL.eq (toSQL T.artistsC.id) (id "artist_album.artist_id.xata_id"))))
      <*> parallel (run ctx.db (selectFrom T.albums # where_ (SQL.eq (toSQL T.albumsC.id) (id "artist_album.album_id.xata_id"))))
  liftEffect (Log.info ("New track: " <> fromMaybe "undefined" (_.title <$> head rows.tracks)))
  results <- parTraverse attempt [indexAlbums ctx rows.albums, indexArtists ctx rows.artists, indexTracks ctx rows.tracks]
  for_ results case _ of
    Left e -> liftEffect (Log.warnF "[typesense] index failed:" [toForeign e])
    Right _ -> pure unit
