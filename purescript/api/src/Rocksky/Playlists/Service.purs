module Rocksky.Playlists.Service where

import Prelude
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Atproto.Lexicon as Lexicon
import Atproto.XrpcServer as Xrpc
import Data.Array (filter, head, index, last, mapMaybe, null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable as Nullable
import Data.String (Pattern(..), split, stripPrefix)
import Data.Traversable (for, for_)
import Drizzle.Builder (innerJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign (mergeForeign, omitNulls, toForeign)
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)

playlistCollection :: String
playlistCollection = "app.rocksky.playlist"

playlistSongCollection :: String
playlistSongCollection = "app.rocksky.playlist.song"

atUriRepo :: String -> String
atUriRepo uri = fromMaybe "" (head (split (Pattern "/") (fromMaybe uri (stripPrefix (Pattern "at://") uri))))

rkeyOf :: String -> String
rkeyOf = fromMaybe "" <<< last <<< split (Pattern "/")

invalid :: forall a. String -> Aff a
invalid = throwError <<< Xrpc.invalidRequestError

invalidNamed :: forall a. String -> String -> Aff a
invalidNamed message name = throwError (Xrpc.invalidRequestNamedError message name)

requireOwner :: String -> String -> String -> Aff Unit
requireOwner did uri message = do
  when (atUriRepo uri == "") (invalidNamed ("Not an AT-URI: " <> uri) "InvalidUri")
  unless (atUriRepo uri == did) (invalidNamed message "Forbidden")

validate :: Context -> String -> Foreign -> String -> Aff Unit
validate ctx collection record message = case Lexicon.validateRecord ctx.lexicons collection record of
  Left _ -> invalidNamed message "InvalidRecord"
  Right _ -> pure unit

recordRef :: Context -> String -> String -> Aff Api.RecordRef
recordRef ctx uri collection = do
  let repo = atUriRepo uri
  when (repo == "") (invalidNamed ("Not an AT-URI: " <> uri) "InvalidUri")
  pds <- extractPdsFromDid repo
  service <- case pds of
    Just s -> pure s
    Nothing -> invalid ("PDS not found: " <> repo)
  agent <- liftEffect (Api.newAtpAgent service)
  rec <- Api.getRecord agent { repo, collection, rkey: rkeyOf uri }
  let ref = toForeign { uri, cid: rec.cid }
  case Lexicon.validate ctx.lexicons "com.atproto.repo.strongRef" ref, Nullable.toMaybe rec.cid of
    Right _, Just cid -> pure { uri, cid }
    _, _ -> invalidNamed ("Invalid ref for " <> uri) "InvalidRef"

type PlaylistInput = { name :: String, description :: Nullable.Nullable String, pictureUrl :: Nullable.Nullable String }

createPlaylist :: Context -> Api.Agent -> PlaylistInput -> Aff Api.RecordRef
createPlaylist ctx agent input = do
  createdAt <- nowIso
  let nonempty value = Nullable.toNullable (Nullable.toMaybe value >>= \s -> if s == "" then Nothing else Just s)
  let record = omitNulls (toForeign { "$type": playlistCollection, name: input.name, description: nonempty input.description, pictureUrl: nonempty input.pictureUrl, createdAt })
  validate ctx playlistCollection record "Invalid playlist record"
  repo <- liftEffect (Api.assertDid agent)
  rkey <- liftEffect tidNextStr
  Api.createRecord agent { repo, collection: playlistCollection, rkey: Nullable.notNull rkey, record, validate: false }

updatePlaylist :: Context -> Api.Agent -> String -> String -> Foreign -> Aff Api.RecordRef
updatePlaylist ctx agent did uri patch = do
  requireOwner did uri "Only the playlist owner can edit it"
  repo <- liftEffect (Api.assertDid agent)
  existing <- Api.getRecord agent { repo, collection: playlistCollection, rkey: rkeyOf uri }
  let record = mergeForeign existing.value (mergeForeign (omitNulls patch) (toForeign { "$type": playlistCollection }))
  validate ctx playlistCollection record "Invalid playlist record"
  Api.putRecord agent { repo, collection: playlistCollection, rkey: rkeyOf uri, record, validate: false, swapRecord: Nothing }

addSongsToPlaylist :: Context -> Api.Agent -> String -> String -> Array String -> Aff (Array String)
addSongsToPlaylist ctx agent did playlistUri songUris = do
  requireOwner did playlistUri "Only the playlist owner can add songs to it"
  playlist <- recordRef ctx playlistUri playlistCollection
  for songUris \songUri -> do
    rows :: Array SelectTrack <- run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string songUri)) # limit 1)
    track <- case head rows of
      Just row -> pure row
      Nothing -> invalidNamed ("Song not found: " <> songUri) "NotFound"
    song <- recordRef ctx songUri "app.rocksky.song"
    addedAt <- nowIso
    let record = omitNulls (toForeign { "$type": playlistSongCollection, playlist, song, title: track.title, artist: track.artist, album: track.album, albumArtist: track.albumArtist, duration: track.duration, albumArtUrl: Nullable.toNullable (Nullable.toMaybe track.albumArt >>= \art -> if art == "" then Nothing else Just art), addedAt })
    validate ctx playlistSongCollection record ("Invalid playlist song record for " <> songUri)
    repo <- liftEffect (Api.assertDid agent)
    rkey <- liftEffect tidNextStr
    _.uri <$> Api.createRecord agent { repo, collection: playlistSongCollection, rkey: Nullable.notNull rkey, record, validate: false }

type Entry = { uri :: Nullable.Nullable String, songUri :: Nullable.Nullable String }

entries :: Context -> String -> Aff (Array Entry)
entries ctx uri = run ctx.db
  ( selectFieldsFrom { uri: toSQL T.playlistTracksC.uri, songUri: toSQL T.tracksC.uri } T.playlistTracks
      # innerJoin T.playlists (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))
      # innerJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
      # where_ (SQL.eq (toSQL T.playlistsC.uri) (SQL.string uri))
      # orderBy [ SQL.asc (toSQL T.playlistTracksC.addedAt), SQL.asc (toSQL T.playlistTracksC.createdAt) ]
  )

ownUris :: String -> Array Entry -> Array String
ownUris did = mapMaybe (\row -> Nullable.toMaybe row.uri >>= \uri -> if uri /= "" && atUriRepo uri == did then Just uri else Nothing)

removePlaylist :: Context -> Api.Agent -> String -> String -> Aff Unit
removePlaylist ctx agent did uri = do
  requireOwner did uri "Only the playlist owner can remove it"
  entryRows :: Array { uri :: Nullable.Nullable String } <- run ctx.db
    ( selectFieldsFrom { uri: toSQL T.playlistTracksC.uri } T.playlistTracks
        # innerJoin T.playlists (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))
        # where_ (SQL.eq (toSQL T.playlistsC.uri) (SQL.string uri))
    )
  let rows = map (\row -> { uri: row.uri, songUri: Nullable.null }) entryRows
  repo <- liftEffect (Api.assertDid agent)
  for_ (ownUris did rows) \entry -> Api.deleteRecord agent { repo, collection: playlistSongCollection, rkey: rkeyOf entry }
  Api.deleteRecord agent { repo, collection: playlistCollection, rkey: rkeyOf uri }

removeTrackFromPlaylist :: Context -> Api.Agent -> String -> String -> Maybe String -> Maybe Int -> Aff Unit
removeTrackFromPlaylist ctx agent did uri songUri position = do
  rows <- entries ctx uri
  targets <- case position of
    Just i -> case index rows i of
      Nothing -> invalidNamed ("No track at position " <> show i <> " in that playlist") "NotFound"
      Just row -> do
        case songUri of
          Just song | song /= "" && Nullable.toMaybe row.songUri /= Just song -> invalidNamed "The playlist changed since you loaded it — reload and try again" "Conflict"
          _ -> pure unit
        pure [ row ]
    Nothing -> case songUri of
      Just song | song /= "" -> pure (filter (\row -> Nullable.toMaybe row.songUri == Just song) rows)
      _ -> invalid "Pass either index or songUri"
  let own = ownUris did targets
  when (null own) $ invalidNamed (if null targets then "Track not found in playlist" else "That track was added by someone else and can only be removed by them") (if null targets then "NotFound" else "Forbidden")
  repo <- liftEffect (Api.assertDid agent)
  for_ own \entry -> Api.deleteRecord agent { repo, collection: playlistSongCollection, rkey: rkeyOf entry }
