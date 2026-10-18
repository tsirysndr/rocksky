module Rocksky.Scripts.BackfillLikes (main, backfill, rebuild, resolveTrackId, cachedSongHash, splitAtUri, ensureUser) where

import Prelude
import Atproto.Api as Api
import Atproto.Identity as Identity
import Consola as Log
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldM)
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (notNull, null, toMaybe)
import Data.String (Pattern(..), Replacement(..), replace, split, stripPrefix, toLower)
import Data.Traversable (for_)
import Drizzle.Builder (insertForeign, limit, onConflictDoNothing, run, runInsertReturning, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Nats as Nats
import Node.Crypto (hashHex)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.BskyProfile (fetchBskyProfile)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.LovedTracks (SelectLovedTrack)
import Rocksky.Scripts.Common (exit, isoString, publishJson, resolveDid, runScript, scriptArgs)

type Uri = { repo :: String, collection :: String, rkey :: String }
type Counts = { created :: Int, skipped :: Int, unresolved :: Int }

splitAtUri :: String -> Maybe Uri
splitAtUri uri = do
  let parts = split (Pattern "/") (replace (Pattern "at://") (Replacement "") uri)
  repo <- A.index parts 0
  collection <- A.index parts 1
  rkey <- A.index parts 2
  if repo == "" || collection == "" || rkey == "" then Nothing else Just { repo, collection, rkey }

ensureUser :: Context -> String -> String -> Api.Agent -> Aff SelectUser
ensureUser ctx did handle agent = do
  users <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1) :: Aff (Array SelectUser)
  case A.head users of
    Just user -> pure user
    Nothing -> do
      profile <- fetchBskyProfile (Just did) (Just agent)
      inserted <- runInsertReturning ctx.db (insertForeign T.users [F.toForeign { did, handle, displayName: fromMaybe "" profile.displayName, avatar: fromMaybe "" profile.avatar }]) :: Aff (Array SelectUser)
      user <- firstRow inserted
      liftEffect do
        Log.info ("Created user " <> handle)
        publishJson ctx "rocksky.user" (F.toForeign { xata_id: user.id, did: user.did, handle: user.handle, display_name: user.displayName, avatar: user.avatar
          , xata_createdat: isoString user.createdAt, xata_updatedat: isoString user.updatedAt, xata_version: 1 })
      pure user

cachedSongHash :: Context -> Effect (String -> Aff (Maybe String))
cachedSongHash ctx = do
  cache <- Ref.new Map.empty
  pure \uri -> do
    known <- liftEffect (Map.lookup uri <$> Ref.read cache)
    case known of
      Just hash -> pure hash
      Nothing -> do
        result <- attempt case splitAtUri uri of
          Nothing -> pure Nothing
          Just parts -> do
            identity <- Identity.resolveAtprotoData ctx.baseIdResolver parts.repo
            agent <- liftEffect (Api.newAtpAgent identity.pds)
            song <- _.value <$> Api.getRecord agent parts
            pure do
              title <- F.readStringAt "title" song
              artist <- F.readStringAt "artist" song
              album <- F.readStringAt "album" song
              if title == "" || artist == "" || album == "" then Nothing else Just (hashHex "sha256" (toLower (title <> " - " <> artist <> " - " <> album)))
        hash <- case result of
          Right value -> pure value
          Left e -> liftEffect (Log.warn ("Could not fetch " <> uri <> ": " <> message e)) *> pure Nothing
        liftEffect (Ref.modify_ (Map.insert uri hash) cache)
        pure hash

resolveTrackId :: Context -> (String -> Aff (Maybe String)) -> String -> Aff (Maybe String)
resolveTrackId ctx songHash uri = do
  direct <- run ctx.db (selectFieldsFrom { id: T.tracksC.id } T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string uri)) # limit 1) :: Aff (Array { id :: String })
  case A.head direct of
    Just row -> pure (Just row.id)
    Nothing -> do
      userTrack <- run ctx.db (selectFieldsFrom { id: T.userTracksC.trackId } T.userTracks # where_ (SQL.eq (toSQL T.userTracksC.uri) (SQL.string uri)) # limit 1) :: Aff (Array { id :: String })
      case A.head userTrack of
        Just row -> pure (Just row.id)
        Nothing -> songHash uri >>= case _ of
          Nothing -> pure Nothing
          Just hash -> do
            tracks <- run ctx.db (selectFieldsFrom { id: T.tracksC.id } T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string hash)) # limit 1) :: Aff (Array { id :: String })
            pure (_.id <$> A.head tracks)

rebuild :: Context -> Api.Agent -> String -> String -> (String -> Aff (Maybe String)) -> Aff Counts
rebuild ctx agent did userId resolve = page null { created: 0, skipped: 0, unresolved: 0 }
  where
  page cursor counts = do
    data_ <- Api.listRecords agent { repo: did, collection: "app.rocksky.like", limit: 100, cursor }
    next <- foldM process counts data_.records
    case toMaybe data_.cursor of
      Just value | value /= "" -> page (notNull value) next
      _ -> pure next
  process counts record = case F.readStringAt "subject.uri" record.value of
    Just subject | map _.collection (splitAtUri subject) == Just "app.rocksky.song" -> do
      existing <- run ctx.db (selectFieldsFrom { id: T.lovedTracksC.id } T.lovedTracks # where_ (SQL.eq (toSQL T.lovedTracksC.uri) (SQL.string record.uri)) # limit 1) :: Aff (Array { id :: String })
      if not (A.null existing) then pure (counts { skipped = counts.skipped + 1 })
      else resolve subject >>= case _ of
        Just trackId | trackId /= "" -> do
          duplicate <- run ctx.db (selectFieldsFrom { id: T.lovedTracksC.id } T.lovedTracks
            # where_ (SQL.and (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string userId)) (SQL.eq (toSQL T.lovedTracksC.trackId) (SQL.string trackId))) # limit 1) :: Aff (Array { id :: String })
          if not (A.null duplicate) then pure (counts { skipped = counts.skipped + 1 })
          else do
            createdAt <- liftEffect case F.readStringAt "createdAt" record.value of
              Just value | value /= "" -> Date.parse value
              _ -> Date.now
            inserted <- runInsertReturning ctx.db (insertForeign T.lovedTracks [F.toForeign { userId, trackId, uri: record.uri, createdAt }] # onConflictDoNothing) :: Aff (Array SelectLovedTrack)
            case A.head inserted of
              Nothing -> pure (counts { skipped = counts.skipped + 1 })
              Just created -> do
                liftEffect do
                  publishJson ctx "rocksky.like" (F.toForeign { uri: record.uri, user_id: { xata_id: userId }, track_id: { xata_id: trackId }
                    , xata_createdat: isoString created.createdAt, xata_id: created.id, xata_updatedat: isoString created.createdAt, xata_version: 0 })
                  Log.info ("Recreated like " <> record.uri)
                pure (counts { created = counts.created + 1 })
        _ -> do
          liftEffect (Log.warn ("Song not found for " <> record.uri <> " → " <> subject))
          pure (counts { unresolved = counts.unresolved + 1 })
    _ -> pure counts

backfill :: Context -> (String -> Aff (Maybe String)) -> String -> Aff Unit
backfill ctx songHash input = do
  did <- case stripPrefix (Pattern "did:") input of
    Just _ -> pure input
    Nothing -> resolveDid ctx (fromMaybe input (stripPrefix (Pattern "@") input))
  identity <- Identity.resolveAtprotoData ctx.baseIdResolver did
  agent <- liftEffect (Api.newAtpAgent identity.pds)
  user <- ensureUser ctx did identity.handle agent
  liftEffect (Log.info ("Backfilling likes for " <> identity.handle <> " (" <> did <> ") ..."))
  counts <- rebuild ctx agent did user.id (resolveTrackId ctx songHash)
  liftEffect (Log.info (identity.handle <> ": " <> show counts.created <> " created, " <> show counts.skipped <> " skipped, " <> show counts.unresolved <> " unresolved"))

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  when (A.null args) do
    liftEffect (Log.error "Usage: node bin/run.js Rocksky.Scripts.BackfillLikes <handle|did> [<handle|did> ...]")
    exit 1
  songHash <- liftEffect (cachedSongHash ctx)
  for_ args \arg -> do
    result <- attempt (backfill ctx songHash arg)
    case result of
      Left e -> liftEffect (Log.errorF ("Failed to backfill likes for " <> arg <> ":") [errorToForeign e])
      Right _ -> pure unit
  Nats.flush ctx.nc
  exit 0
