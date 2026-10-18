module Rocksky.Scripts.BackfillTrackUri (main, backfill, collectWithAgent, applyFound, backfillFromUserTracks, mapWithConcurrency, Options, Found) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Control.Parallel (parTraverse_)
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldM)
import Data.Int as Int
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (notNull, null, toMaybe)
import Data.String (toLower)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Database (Database, executeResult, executeRows)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Node.Crypto (hashHex)
import Rocksky.Drizzle (createPools)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Scripts.Common (envFlag, envNumber, exit, runScript)

type Options = { dryRun :: Boolean, allUsers :: Boolean, concurrency :: Number }
type Found = Array { hash :: String, uri :: String }
type Wanted = Map.Map String String

countNullUri :: Database Postgres -> Aff Int
countNullUri db = do
  rows <- run db (selectFieldsFrom { n: SQL.raw "count(*)::int" } T.tracks # where_ (SQL.isNull (toSQL T.tracksC.uri))) :: Aff (Array { n :: Int })
  pure (fromMaybe 0 (_.n <$> A.head rows))

backfillFromUserTracks :: Database Postgres -> Boolean -> Aff Int
backfillFromUserTracks db dryRun = if dryRun then do
  rows <- executeRows db (SQL.raw "SELECT count(*)::int AS n FROM tracks t JOIN user_tracks ut ON ut.track_id = t.xata_id WHERE t.uri IS NULL AND ut.uri LIKE 'at://%/app.rocksky.song/%' AND NOT EXISTS (SELECT 1 FROM tracks o WHERE o.uri = ut.uri)")
  pure (fromMaybe 0 (A.head rows >>= F.readIntAt "n"))
  else do
    result <- executeResult db (SQL.raw "UPDATE tracks t SET uri = ut.uri FROM user_tracks ut WHERE ut.track_id = t.xata_id AND t.uri IS NULL AND ut.uri LIKE 'at://%/app.rocksky.song/%' AND NOT EXISTS (SELECT 1 FROM tracks o WHERE o.uri = ut.uri)")
    pure (fromMaybe 0 (F.readIntAt "rowCount" result))

collectWithAgent :: Api.Agent -> String -> Wanted -> Ref.Ref Found -> Aff Int
collectWithAgent agent did wanted found = page null 0 0
  where
  page cursor hits scanned = do
    result <- Api.listRecords agent { repo: did, collection: "app.rocksky.song", limit: 100, cursor }
    added <- foldM (\count record -> case F.readStringAt "title" record.value, F.readStringAt "artist" record.value of
      Just title, Just artist | title /= "" && artist /= "" -> do
        let album = fromMaybe "" (F.readStringAt "album" record.value)
        let hash = hashHex "sha256" (toLower (title <> " - " <> artist <> " - " <> album))
        liftEffect do
          current <- Ref.read found
          if not (Map.member hash wanted) || A.any (\r -> r.hash == hash) current then pure count
          else Ref.write (A.snoc current { hash, uri: record.uri }) found *> pure (count + 1)
      _, _ -> pure count) 0 result.records
    let total = scanned + A.length result.records
    let matches = hits + added
    case toMaybe result.cursor of
      Just next | next /= "" && not (A.null result.records) -> page (notNull next) matches total
      _ -> do
        liftEffect (Log.info (did <> ": scanned " <> show total <> " song records, " <> show matches <> " match a uri-less track"))
        pure matches

collect :: String -> Wanted -> Ref.Ref Found -> Aff Unit
collect did wanted found = do
  endpoint <- extractPdsFromDid did
  case endpoint of
    Nothing -> liftEffect (Log.warn ("No PDS for " <> did <> " — skipping"))
    Just pds | pds == "" -> liftEffect (Log.warn ("No PDS for " <> did <> " — skipping"))
    Just pds -> do
      agent <- liftEffect (Api.newAtpAgent pds)
      void (collectWithAgent agent did wanted found)

applyFound :: Database Postgres -> Boolean -> Found -> Aff Int
applyFound db dryRun = foldM (\count row -> if dryRun then pure (count + 1) else do
  result <- attempt (executeResult db (SQL.template
    ["UPDATE tracks SET uri = ", " WHERE sha256 = ", " AND uri IS NULL AND NOT EXISTS (SELECT 1 FROM tracks o WHERE o.uri = ", ")"]
    [SQL.string row.uri, SQL.string row.hash, SQL.string row.uri]))
  case result of
    Right value -> pure (count + fromMaybe 0 (F.readIntAt "rowCount" value))
    Left e -> do
      liftEffect (Log.warnF ("Failed to set " <> row.uri <> " on " <> row.hash <> ":") [errorToForeign e])
      pure count) 0

mapWithConcurrency :: forall a. Array a -> Number -> (a -> Int -> Aff Unit) -> Aff Unit
mapWithConcurrency items concurrency worker = do
  cursor <- liftEffect (Ref.new 0)
  let loop = do
        index <- liftEffect do
          i <- Ref.read cursor
          Ref.write (i + 1) cursor
          pure i
        case A.index items index of
          Nothing -> pure unit
          Just item -> do
            result <- attempt (worker item index)
            case result of
              Left e -> liftEffect (Log.warnF ("Worker failed on item " <> show index <> ":") [errorToForeign e])
              Right _ -> pure unit
            loop
  parTraverse_ (const loop) (A.replicate (max 0 (Int.floor (min concurrency (Int.toNumber (A.length items))))) unit)

backfill :: Database Postgres -> Options -> (String -> Wanted -> Ref.Ref Found -> Aff Unit) -> Aff Unit
backfill db opts crawl = do
  when opts.dryRun (liftEffect (Log.info "Dry run — no writes will be made"))
  before <- countNullUri db
  liftEffect (Log.info (show before <> " tracks with a NULL uri"))
  first <- backfillFromUserTracks db opts.dryRun
  liftEffect (Log.success ("Pass 1 (user_tracks): " <> show first <> " tracks " <> (if opts.dryRun then "would be" else "") <> " filled"))
  rows <- run db (selectFieldsFrom { id: T.tracksC.id, sha256: T.tracksC.sha256 } T.tracks # where_ (SQL.isNull (toSQL T.tracksC.uri))) :: Aff (Array { id :: String, sha256 :: String })
  let wanted = Map.fromFoldable (map (\r -> Tuple r.sha256 r.id) rows)
  if Map.isEmpty wanted then liftEffect (Log.success "Nothing left to backfill")
  else do
    users <- executeRows db (SQL.raw (if opts.allUsers then "SELECT did FROM users WHERE did IS NOT NULL"
      else "SELECT DISTINCT u.did FROM users u WHERE u.did IS NOT NULL AND (EXISTS (SELECT 1 FROM scrobbles s JOIN tracks t ON t.xata_id = s.track_id WHERE s.user_id = u.xata_id AND t.uri IS NULL) OR EXISTS (SELECT 1 FROM user_tracks ut JOIN tracks t ON t.xata_id = ut.track_id WHERE ut.user_id = u.xata_id AND t.uri IS NULL))"))
    let dids = A.mapMaybe (F.readStringAt "did") users
    liftEffect (Log.info ("Pass 2 (PDS): crawling " <> show (A.length dids) <> " repos for " <> show (Map.size wanted) <> " missing songs"))
    found <- liftEffect (Ref.new [])
    mapWithConcurrency dids opts.concurrency (\did _ -> crawl did wanted found)
    matches <- liftEffect (Ref.read found)
    applied <- applyFound db opts.dryRun matches
    liftEffect (Log.success ("Pass 2 (PDS): " <> show applied <> " tracks " <> (if opts.dryRun then "would be" else "") <> " filled"))
    after <- if opts.dryRun then pure (before - first - applied) else countNullUri db
    liftEffect (Log.info (show after <> " tracks still have a NULL uri — no song record exists for them on any crawled PDS. They pick one up the next time they are scrobbled, since scrobbleTrack republishes when the stored track has no uri."))

main :: Effect Unit
main = runScript do
  pools <- liftEffect createPools
  dryRun <- liftEffect (envFlag "BACKFILL_URI_DRY_RUN" "1")
  allUsers <- liftEffect (envFlag "BACKFILL_URI_ALL_USERS" "1")
  concurrency <- liftEffect (envNumber "BACKFILL_URI_CONCURRENCY" 4.0)
  backfill pools.db { dryRun, allUsers, concurrency } collect
  exit 0
