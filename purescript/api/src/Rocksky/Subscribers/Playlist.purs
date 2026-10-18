module Rocksky.Subscribers.Playlist (onPlaylistImport, onPlaylistIndexed, publishPlaylist, publishWithAgent, publishPlaylistSong) where

import Prelude
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Atproto.Lexicon as Lexicon
import Consola as Log
import Data.Array (elem, head, mapMaybe)
import Data.Either (Either(..), isRight)
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe, toNullable)
import Data.Traversable (for_)
import Drizzle.Builder (leftJoin, limit, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (Subscription)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign (omitNulls, path, readArrayAt, readStringAt, toForeign, undefined)
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Playlists.Service (atUriRepo, rkeyOf)
import Rocksky.Schema as T
import Rocksky.Schema.Playlists (SelectPlaylist)
import Rocksky.Shouts.Service (strongRef, validate)
import Rocksky.Subscribers.Consumer (start, startRaw)
import Rocksky.Typesense.Search (indexPlaylists)

nonempty :: String -> Foreign -> Maybe String
nonempty key value = readStringAt key value >>= \s -> if s == "" then Nothing else Just s

onPlaylistImport :: Context -> Effect Subscription
onPlaylistImport ctx = start ctx "rocksky.playlist.import" \payload -> do
  liftEffect (Log.info ("Importing playlist: " <> fromMaybe "" (readStringAt "did" payload) <> " - " <> fromMaybe "" (readStringAt "name" payload)))
  publishPlaylist ctx payload

onPlaylistIndexed :: Context -> Effect Subscription
onPlaylistIndexed ctx = startRaw ctx "rocksky.playlist.indexed" \id -> do
  result <- attempt do
    rows :: Array SelectPlaylist <- run ctx.db (selectFrom T.playlists # where_ (SQL.eq (toSQL T.playlistsC.id) (SQL.string id)))
    case head rows of
      Nothing -> pure unit
      Just row -> indexPlaylists ctx [row]
  case result of
    Left e -> liftEffect (Log.warnF "[typesense] playlist index failed:" [toForeign e])
    Right _ -> pure unit

publishPlaylist :: Context -> Foreign -> Aff Unit
publishPlaylist ctx payload = do
  agent <- createAgent ctx (fromMaybe "" (readStringAt "did" payload))
  case agent of
    Nothing -> liftEffect (Log.error ("Failed to create agent, skipping playlist: " <> fromMaybe "" (readStringAt "name" payload)))
    Just a -> publishWithAgent ctx a payload

publishWithAgent :: Context -> Api.Agent -> Foreign -> Aff Unit
publishWithAgent ctx agent payload = do
  existing <- case nonempty "spotifyLink" payload of
    Nothing -> pure Nothing
    Just link -> do
      rows :: Array SelectPlaylist <- run ctx.db (selectFrom T.playlists # where_ (SQL.eq (toSQL T.playlistsC.spotifyLink) (SQL.string link)) # limit 1)
      pure (head rows)
  rkey <- case existing >>= toMaybe <<< _.uri of
    Just uri | uri /= "" -> pure (rkeyOf uri)
    _ -> liftEffect tidNextStr
  createdAt <- case existing of
    Just row -> liftEffect (toISOString row.createdAt)
    Nothing -> nowIso
  let record = omitNulls (toForeign
        { "$type": "app.rocksky.playlist", name: fromMaybe undefined (path "name" payload)
        , description: toNullable (nonempty "description" payload), createdAt
        , pictureUrl: toNullable (nonempty "pictureUrl" payload), spotifyLink: toNullable (nonempty "spotifyLink" payload) })
  if not (isRight (Lexicon.validateRecord ctx.lexicons "app.rocksky.playlist" record)) then liftEffect (Log.errorF "Invalid record:" [record])
  else do
    result <- attempt do
      repo <- liftEffect (Api.assertDid agent)
      Api.putRecord agent { repo, collection: "app.rocksky.playlist", rkey, record, validate: false, swapRecord: Nothing }
    case result of
      Left e -> liftEffect (Log.errorF "Failed to put playlist record:" [toForeign e])
      Right ref -> do
        liftEffect (Log.info ("Playlist record created: " <> ref.uri))
        rows :: Array { uri :: Nullable String } <- run ctx.db
          (selectFieldsFrom { uri: toSQL T.tracksC.uri } T.playlistTracks
            # leftJoin T.playlists (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))
            # leftJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
            # where_ (SQL.eq (toSQL T.playlistsC.uri) (SQL.string ref.uri)))
        let alreadyAdded = mapMaybe (toMaybe <<< _.uri) rows
        songs <- case readArrayAt "songs" payload of
          Just values -> pure values
          Nothing -> throwError (error "Playlist songs must be an array")
        for_ songs \song ->
          unless (elem (fromMaybe "" (readStringAt "uri" song)) alreadyAdded) do
            added <- attempt (publishPlaylistSong ctx agent song ref.uri ref.cid)
            case added of
              Left e -> liftEffect (Log.errorF ("Failed to add " <> fromMaybe "" (readStringAt "title" song) <> " to playlist:") [toForeign e])
              Right _ -> pure unit

publishPlaylistSong :: Context -> Api.Agent -> Foreign -> String -> String -> Aff Unit
publishPlaylistSong ctx agent song playlistUri playlistCid = do
  let uri = fromMaybe "" (readStringAt "uri" song)
  let repo = atUriRepo uri
  pds <- extractPdsFromDid repo
  subject <- liftEffect (Api.newAtpAgent (fromMaybe "" pds))
  found <- Api.getRecord subject { repo, collection: "app.rocksky.song", rkey: rkeyOf uri }
  songRef <- strongRef ctx uri found.cid ("invalid song ref for " <> uri)
  playlistRef <- strongRef ctx playlistUri (notNull playlistCid) ("invalid playlist ref for " <> playlistUri)
  addedAt <- nowIso
  let field name = fromMaybe undefined (path name song)
  let record = omitNulls (toForeign
        { "$type": "app.rocksky.playlist.song", playlist: playlistRef, song: songRef
        , title: field "title", artist: field "artist", album: field "album", albumArtist: field "albumArtist"
        , duration: field "duration", albumArtUrl: toNullable (nonempty "albumArtUrl" song), addedAt })
  validate ctx "app.rocksky.playlist.song" record ("invalid playlist song record for " <> uri)
  rkey <- liftEffect tidNextStr
  ownRepo <- liftEffect (Api.assertDid agent)
  result <- Api.createRecord agent { repo: ownRepo, collection: "app.rocksky.playlist.song", rkey: notNull rkey, record, validate: false }
  liftEffect (Log.info ("Playlist song record created: " <> result.uri))
