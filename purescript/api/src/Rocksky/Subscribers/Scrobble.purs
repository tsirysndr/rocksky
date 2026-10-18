module Rocksky.Subscribers.Scrobble (onNewScrobble, handle, updateUris, refreshScrobbles, updateUrisWithLimit, refreshScrobblesWithLimit) where

import Prelude
import Consola as Log
import Data.Array (head, length)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (toLower)
import Data.Traversable (for_)
import Drizzle.Builder (innerJoin, leftJoin, limit, limitNumber, orderBy, run, runUpdate, selectFieldsFrom, selectFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, forkAff, launchAff_)
import Effect.Class (liftEffect)
import Nats as Nats
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.DiscogsEnrichment (enrichScrobbleWithDiscogs)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Nowplaying.Enrichment (present)
import Rocksky.Nowplaying.Publication (publishScrobble)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Scrobbles (SelectScrobble)
import Rocksky.Schema.Users (SelectUser)

onNewScrobble :: Context -> Effect Nats.Subscription
onNewScrobble ctx = do
  subscription <- Nats.subscribePull ctx.nc "rocksky.scrobble.new"
  launchAff_ (loop subscription)
  pure subscription
  where
  -- The source stops this subscriber on an unhandled lookup/update failure.
  loop subscription = Nats.nextMessage subscription >>= case _ of
    Nothing -> pure unit
    Just message -> handle ctx (Nats.decodeString message) *> loop subscription

handle :: Context -> String -> Aff Unit
handle ctx id = do
  rows :: Array { scrobbles :: SelectScrobble, users :: SelectUser } <- run ctx.db
    (selectFieldsFrom { scrobbles: tableSQL T.scrobbles, users: tableSQL T.users } T.scrobbles
      # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.scrobblesC.id) (SQL.string id)))
  case head rows of
    Nothing -> liftEffect (Log.info ("Scrobble with ID " <> id <> " not found, skipping"))
    Just row -> do
      updateUris ctx row.users.did
      refreshScrobbles ctx row.users.did
      when env."DISCOGS_ENRICHMENT_ENABLED" $ void $ forkAff do
        result <- attempt (enrichScrobbleWithDiscogs ctx row.scrobbles.trackId)
        case result of
          Left e -> liftEffect (Log.warnF ("Discogs enrichment failed for scrobble " <> id <> ":") [toForeign e])
          Right _ -> pure unit

actor :: String -> SQL.SQL
actor did = SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))

updateUris :: Context -> String -> Aff Unit
updateUris ctx = updateUrisWithLimit ctx 5.0

updateUrisWithLimit :: Context -> Number -> String -> Aff Unit
updateUrisWithLimit ctx size did = do
  records :: Array { track :: SelectTrack } <- run ctx.db
    (selectFieldsFrom { track: tableSQL T.tracks } T.scrobbles
      # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
      # innerJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
      # where_ (actor did) # orderBy [SQL.desc (toSQL T.scrobblesC.createdAt)] # limitNumber size)
  for_ records \{ track } -> do
    let hash = sha256Hex (toLower (track.title <> " - " <> track.artist <> " - " <> track.album))
    let albumHash = sha256Hex (toLower (track.album <> " - " <> track.albumArtist))
    let artistHash = sha256Hex (toLower track.albumArtist)
    tracks :: Array SelectTrack <- run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string hash)) # limit 1)
    let findAlbum = do
          rows :: Array SelectAlbum <- run ctx.db (selectFrom T.albums # where_ (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumHash)) # limit 1)
          pure (head rows)
    let findArtist = do
          rows :: Array SelectArtist <- run ctx.db (selectFrom T.artists # where_ (SQL.eq (toSQL T.artistsC.sha256) (SQL.string artistHash)) # limit 1)
          pure (head rows)
    case head tracks of
      Just existing -> do
        unless (present existing.albumUri) do
          liftEffect (Log.info ("Updating album uri for " <> track.id <> " ..."))
          album <- findAlbum
          for_ album \row -> runUpdate ctx.db (update T.tracks { albumUri: row.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string existing.id)))
        unless (present existing.artistUri) do
          liftEffect (Log.info ("Updating artist uri for " <> track.id <> " ..."))
          artist <- findArtist
          for_ artist \row -> runUpdate ctx.db (update T.tracks { artistUri: row.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string existing.id)))
      Nothing -> pure unit
    album <- findAlbum
    case head tracks, album of
      Just _, Just row | not (present row.artistUri) -> do
        liftEffect (Log.info ("Updating artist uri for " <> row.id <> " ..."))
        artist <- findArtist
        for_ artist \a -> runUpdate ctx.db (update T.albums { artistUri: a.uri } # where_ (SQL.eq (toSQL T.albumsC.id) (SQL.string row.id)))
      _, _ -> pure unit

refreshScrobbles :: Context -> String -> Aff Unit
refreshScrobbles ctx = refreshScrobblesWithLimit ctx 5.0 true

refreshScrobblesWithLimit :: Context -> Number -> Boolean -> String -> Aff Unit
refreshScrobblesWithLimit ctx size summary did = do
  rows :: Array { scrobble :: SelectScrobble } <- run ctx.db
    (selectFieldsFrom { scrobble: tableSQL T.scrobbles } T.scrobbles
      # innerJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
      # where_ (actor did) # orderBy [SQL.desc (toSQL T.scrobblesC.createdAt)] # limitNumber size)
  for_ rows \row -> do
    liftEffect (Log.info ("Syncing scrobble " <> row.scrobble.id <> " ..."))
    result <- attempt (publishScrobble ctx row.scrobble.id)
    case result of
      Left e -> liftEffect (Log.errorF ("Failed to sync scrobble " <> row.scrobble.id <> ":") [toForeign e])
      Right _ -> pure unit
  when summary $ liftEffect (Log.info ("Synced " <> show (length rows) <> " scrobbles"))
