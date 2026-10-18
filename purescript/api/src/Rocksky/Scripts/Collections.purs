module Rocksky.Scripts.Collections (main, synchronize, insertArtists, insertAlbums, insertSongs, insertScrobbles, listRecords) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Control.Parallel (parTraverse_, parallel, sequential)
import Data.Array as A
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (null, toNullable, toMaybe)
import Data.String as S
import Drizzle.Builder (insertForeign, limit, onConflictDoNothing, onConflictDoUpdate, run, runInsert, runInsertReturning, selectFrom)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (Table, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Foreign (Foreign)
import Foreign.Object as Object
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Common (withFallbackAlbumArt)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign as F
import Rocksky.Nowplaying.Publication (publishScrobble)
import Rocksky.Schema as T
import Rocksky.Scripts.Common (exit, resolveDid, runScript, scriptArgs)

type Entity = { id :: String, uri :: Foreign }
field :: String -> Foreign -> Foreign
field key v = fromMaybe F.undefined (F.asObject v >>= Object.lookup key)
string :: String -> Foreign -> String
string key = F.stringValue <<< field key
hash :: String -> Effect String
hash = pure <<< sha256Hex <<< S.toLower
trackHash :: Foreign -> Effect String
trackHash v = hash (string "title" v <> " - " <> string "artist" v <> " - " <> string "album" v)
findOne :: forall cols. Context -> Table Postgres cols -> SQL.SQL -> Aff (Maybe Entity)
findOne ctx table condition = A.head <$> (run ctx.db (selectFrom table # where_ condition # limit 1) :: Aff (Array Entity))
required :: Maybe Entity -> Aff Entity
required = case _ of
  Just row -> pure row
  Nothing -> throwError (error "Collection record dependency not found")
trackCondition :: Foreign -> String -> SQL.SQL
trackCondition value sha = if F.truthy (field "mbid" value)
  then SQL.or (SQL.eq (toSQL T.tracksC.mbId) (SQL.string (string "mbid" value))) byHash else byHash
  where byHash = SQL.eq (toSQL T.tracksC.sha256) (SQL.string sha)

listRecords :: Api.Agent -> String -> String -> Aff (Array Api.RecordEntry)
listRecords agent did collection = go [] null
  where
  go acc cursor = do
    result <- Api.listRecords agent { repo: did, collection, limit: 100, cursor }
    let records = acc <> result.records
    liftEffect (Log.info ("Fetched " <> show (A.length records) <> " " <> collection <> " records so far..."))
    case toMaybe result.cursor of
      Just next | next /= "" -> go records (toNullable (Just next))
      _ -> pure records

insertArtists :: Context -> String -> Array Api.RecordEntry -> Aff Unit
insertArtists ctx userId = parTraverse_ \record -> do
  let v = record.value
  sha256 <- liftEffect (hash (string "name" v))
  createdAt <- liftEffect (Date.parse (string "createdAt" v))
  inserted <- runInsertReturning ctx.db (insertForeign T.artists [F.toForeign { uri: record.uri, name: field "name" v, sha256, picture: field "pictureUrl" v, genres: field "tags" v, createdAt }] # onConflictDoNothing) :: Aff (Array Entity)
  artist <- case A.head inserted of
    Just row -> pure row
    Nothing -> findOne ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (SQL.string sha256)) >>= required
  runInsert ctx.db (insertForeign T.userArtists [F.toForeign { userId, artistId: artist.id, uri: record.uri, scrobbles: 1 }]
    # onConflictDoUpdate { target: [toSQL T.userArtistsC.userId, toSQL T.userArtistsC.artistId], set: { scrobbles: 1 }, where_: Nothing })

insertAlbums :: Context -> String -> Array Api.RecordEntry -> Aff Unit
insertAlbums ctx userId = parTraverse_ \record -> do
  let v = record.value
  sha256 <- liftEffect (hash (string "title" v <> " - " <> string "artist" v))
  artist <- findOne ctx T.artists (SQL.eq (toSQL T.artistsC.name) (SQL.string (string "artist" v))) >>= required
  let albumArt = withFallbackAlbumArt (toNullable (F.readStringAt "albumArtUrl" v))
  let updates = { albumArt, artistUri: artist.uri, year: field "year" v, releaseDate: field "releaseDate" v }
  inserted <- runInsertReturning ctx.db (insertForeign T.albums [F.mergeForeign (F.toForeign updates) (F.toForeign { title: field "title" v, artist: field "artist" v, uri: record.uri, sha256 })]
    # onConflictDoUpdate { target: [toSQL T.albumsC.sha256], set: updates, where_: Nothing }) :: Aff (Array Entity)
  album <- case A.head inserted of
    Just row -> pure row
    Nothing -> findOne ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (SQL.string sha256)) >>= required
  parTraverse_ identity
    [ runInsert ctx.db (insertForeign T.userAlbums [F.toForeign { userId, albumId: album.id, uri: record.uri, scrobbles: 1 }]
        # onConflictDoUpdate { target: [toSQL T.userAlbumsC.userId, toSQL T.userAlbumsC.albumId], set: { scrobbles: 1 }, where_: Nothing })
    , runInsert ctx.db (insertForeign T.artistAlbums [F.toForeign { albumId: album.id, artistId: artist.id }] # onConflictDoNothing)
    ]

insertSongs :: Context -> String -> Array Api.RecordEntry -> Aff Unit
insertSongs ctx userId = parTraverse_ \record -> do
  let v = record.value
  outcome <- attempt do
    related <- sequential $ { artist: _, album: _ }
      <$> parallel (findOne ctx T.artists (SQL.eq (toSQL T.artistsC.name) (SQL.string (string "albumArtist" v))))
      <*> parallel (findOne ctx T.albums (SQL.and (SQL.eq (toSQL T.albumsC.title) (SQL.string (string "album" v))) (SQL.eq (toSQL T.albumsC.artist) (SQL.string (string "albumArtist" v)))))
    case related.artist, related.album of
      Just artist, Just album -> do
        sha256 <- liftEffect (trackHash v)
        createdAt <- liftEffect (Date.parse (string "createdAt" v))
        inserted <- runInsertReturning ctx.db (insertForeign T.tracks [F.toForeign
          { title: field "title" v, artist: field "artist" v, albumArtist: field "albumArtist" v, album: field "album" v, uri: record.uri
          , albumArt: withFallbackAlbumArt (toNullable (F.readStringAt "albumArtUrl" v)), artistUri: artist.uri, albumUri: album.uri, sha256
          , duration: field "duration" v, mbId: field "mbid" v, trackNumber: field "trackNumber" v, discNumber: field "discNumber" v
          , composer: field "composer" v, label: field "label" v, lyrics: field "lyrics" v, genre: field "genre" v
          , copyrightMessage: field "copyrightMessage" v, spotifyLink: field "spotifyLink" v, appleMusicLink: field "appleMusicLink" v, tidalLink: field "tidalLink" v, createdAt
          }] # onConflictDoNothing) :: Aff (Array Entity)
        found <- case A.head inserted of
          Just row -> pure (Just row)
          Nothing -> findOne ctx T.tracks (trackCondition v sha256)
        case found of
          Nothing -> liftEffect (Log.warn ("Track not found after conflict for song " <> string "title" v <> " — skipping"))
          Just track -> parTraverse_ identity
            [ void (runInsertReturning ctx.db (insertForeign T.userTracks [F.toForeign { userId, trackId: track.id, uri: record.uri, scrobbles: 1 }]
                # onConflictDoUpdate { target: [toSQL T.userTracksC.userId, toSQL T.userTracksC.trackId], set: { scrobbles: 1 }, where_: Nothing }) :: Aff (Array {}))
            , runInsert ctx.db (insertForeign T.albumTracks [F.toForeign { albumId: album.id, trackId: track.id }] # onConflictDoNothing)
            , runInsert ctx.db (insertForeign T.artistTracks [F.toForeign { artistId: artist.id, trackId: track.id }] # onConflictDoNothing)
            ]
      Nothing, _ -> liftEffect (Log.warn ("Artist not found for song " <> string "title" v <> ": " <> string "albumArtist" v <> " — skipping"))
      _, Nothing -> liftEffect (Log.warn ("Album not found for song " <> string "title" v <> ": " <> string "album" v <> " — skipping"))
  case outcome of
    Right _ -> pure unit
    Left e -> do
      sha <- liftEffect (trackHash v)
      liftEffect do
        Log.errorF ("Failed to insert song record with URI " <> string "title" v <> " - " <> string "artist" v <> " - " <> string "album" v <> " " <> record.uri <> " " <> sha) [F.toForeign e]
        Log.info (F.stringifyPretty v)

insertScrobbles :: Context -> String -> (String -> Aff Unit) -> Array Api.RecordEntry -> Aff Unit
insertScrobbles ctx userId publishRecord = parTraverse_ \record -> do
  let v = record.value
  trackSha <- liftEffect (trackHash v)
  albumSha <- liftEffect (hash (string "album" v <> " - " <> string "albumArtist" v))
  artistSha <- liftEffect (hash (string "albumArtist" v))
  related <- sequential $ { track: _, album: _, artist: _ }
    <$> parallel (findOne ctx T.tracks (trackCondition v trackSha) >>= required)
    <*> parallel (findOne ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumSha)) >>= required)
    <*> parallel (findOne ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (SQL.string artistSha)) >>= required)
  timestamp <- liftEffect (Date.parse (string "createdAt" v))
  inserted <- runInsertReturning ctx.db (insertForeign T.scrobbles [F.toForeign { albumId: related.album.id, trackId: related.track.id, artistId: related.artist.id, uri: record.uri, userId, timestamp, createdAt: timestamp }] # onConflictDoNothing) :: Aff (Array Entity)
  -- Source catches only conflict lookup and publication, not catalog/insert errors.
  outcome <- attempt do
    found <- case A.head inserted of
      Just row -> pure (Just row)
      Nothing -> findOne ctx T.scrobbles (SQL.or
        (SQL.and (SQL.and (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string userId)) (SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string related.track.id))) (SQL.eq (toSQL T.scrobblesC.timestamp) (SQL.param timestamp)))
        (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string record.uri)))
    case found of
      Just row -> publishRecord row.id
      Nothing -> liftEffect (Log.warn ("Scrobble not found after conflict for " <> string "title" v <> " " <> record.uri <> " — skipping publish"))
  case outcome of
    Right _ -> pure unit
    Left e -> liftEffect (Log.errorF "Failed to sync scrobble:" [F.toForeign e])

synchronize :: Context -> String -> String -> Api.Agent -> (String -> Aff Unit) -> Aff Unit
synchronize ctx userId did agent publishRecord = do
  scrobbles <- listRecords agent did "app.rocksky.scrobble"
  songs <- listRecords agent did "app.rocksky.song"
  artists <- listRecords agent did "app.rocksky.artist"
  albums <- listRecords agent did "app.rocksky.album"
  insertArtists ctx userId artists
  insertAlbums ctx userId albums
  insertSongs ctx userId songs
  insertScrobbles ctx userId publishRecord scrobbles

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  identifier <- case A.head args of
    Just value -> pure value
    Nothing -> throwError (error "Please provide user identifier (handle or DID). Usage: node bin/run.js Rocksky.Scripts.Collections <handle|did>")
  did <- if isJust (S.stripPrefix (S.Pattern "did:") identifier) then pure identifier else resolveDid ctx identifier
  user <- findOne ctx T.users (SQL.eq (toSQL T.usersC.did) (SQL.string did)) >>= case _ of
    Just value -> pure value
    Nothing -> throwError (error ("User with DID " <> did <> " not found in database."))
  service <- extractPdsFromDid did >>= case _ of
    Just endpoint -> pure endpoint
    Nothing -> throwError (error "No PDS endpoint found")
  agent <- liftEffect (Log.info ("Using service endpoint: " <> service) *> Api.newAtpAgent service)
  synchronize ctx user.id did agent (publishScrobble ctx)
  liftEffect (Log.success (identifier <> " Collections fetched successfully!"))
  exit 0
