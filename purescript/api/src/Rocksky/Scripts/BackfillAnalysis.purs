module Rocksky.Scripts.BackfillAnalysis (main, backfill, selectBatch, Options, Upload, Operations, Counters, cachedDownload) where

import Prelude
import Aws.S3 as S3
import Consola as Log
import Data.Foldable (foldM)
import Control.Parallel (parTraverse)
import Control.Promise (Promise, fromAff, toAffE)
import Data.Array as A
import Data.Either (Either(..))
import Data.Int as Int
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, notNull, toMaybe, toNullable)
import Data.Number as Number
import Data.Set as Set
import Data.String.CodeUnits as CU
import Drizzle.Builder (innerJoin, limit, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Effect.Ref as Ref
import Fetch.Abort as Abort
import Node.Buffer (Buffer)
import Rocksky.Analysis as Analysis
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Schema as T
import Rocksky.Scripts.BackfillReplaygain as Replaygain
import Rocksky.Scripts.Common (envNumber, envLimit, envString, envFlag, exit, nowMs, padStart, padEnd, runScript, showNumber, toFixed)
import Rocksky.Storage.App (ResolvedStorage, resolveStorageClient)
import Rocksky.Uploads.Analysis (loadAnalysisModule, storeTrackAnalysis)

type Options = { batchSize :: Int, limit :: Number, userId :: Maybe String, dryRun :: Boolean, onlyFingerprint :: Boolean }
type Upload = { uploadId :: String, r2Key :: String, mimeType :: String, userId :: String, storageProviderId :: Nullable String, trackId :: String, title :: String, artist :: String }
type Counters = { processed :: Int, filled :: Int, failed :: Int, downloadFailed :: Int }
type Operations =
  { download :: Upload -> Aff Buffer
  , analyze :: Array Analysis.AnalyzeBatchItem -> (Analysis.AnalyzeBatchProgress -> Effect Unit) -> Aff (Array Analysis.AnalyzeBatchResult)
  , store :: String -> Analysis.AudioAnalysis -> Aff Unit
  }

selectBatch :: Number -> Set.Set String -> Array Upload -> { batch :: Array Upload, seen :: Set.Set String, cursor :: String }
selectBatch capacity seen rows = go [] seen "" rows
  where
  fallback = fromMaybe "" (_.uploadId <$> A.last rows)
  go batch known cursor rest
    | Int.toNumber (A.length batch) >= capacity = { batch, seen: known, cursor: if cursor == "" then fallback else cursor }
    | otherwise = case A.uncons rest of
        Nothing -> { batch, seen: known, cursor: if cursor == "" then fallback else cursor }
        Just { head: row, tail } -> if Set.member row.trackId known then go batch known row.uploadId tail
          else go (A.snoc batch row) (Set.insert row.trackId known) row.uploadId tail

extension :: String -> Maybe String
extension mime = case mime of
  "audio/wav" -> Just "wav"
  "audio/x-wav" -> Just "wav"
  "audio/aiff" -> Just "aiff"
  "audio/x-aiff" -> Just "aiff"
  _ -> Replaygain.extension mime

cachedDownload :: Context -> Int -> Effect (Upload -> Aff Buffer)
cachedDownload ctx timeout = do
  cache <- Ref.new (Map.empty :: Map.Map String (Promise ResolvedStorage))
  pure \row -> Abort.withTimeout timeout \signal -> do
    let provider = toMaybe row.storageProviderId
    let key = case provider of
          Just value | value /= "" -> row.userId <> ":" <> value
          _ -> "managed"
    promise <- liftEffect do
      clients <- Ref.read cache
      case Map.lookup key clients of
        Just value -> pure value
        Nothing -> do
          value <- fromAff (resolveStorageClient ctx row.userId provider)
          Ref.modify_ (Map.insert key value) cache
          pure value
    storage <- toAffE (pure promise)
    _.body <$> S3.getObjectWithSignal storage.client storage.bucket row.r2Key signal

eta :: Number -> String
eta seconds
  | not (Number.isFinite seconds) = "—"
  | otherwise =
      let m = Int.floor (seconds / 60.0)
          s = Int.round (seconds - Int.toNumber m * 60.0)
      in if m > 0 then show m <> "m" <> (if s < 10 then "0" else "") <> show s <> "s" else show s <> "s"

backfill :: Context -> Options -> Operations -> Aff Counters
backfill ctx opts ops = do
  let
    missing = if opts.onlyFingerprint then SQL.isNull (toSQL T.tracksC.acoustidFingerprint)
      else SQL.or (SQL.isNull (toSQL T.tracksC.key)) (SQL.or (SQL.isNull (toSQL T.tracksC.bpm)) (SQL.isNull (toSQL T.tracksC.acoustidFingerprint)))
    filters = case opts.userId of
      Just id | id /= "" -> SQL.and missing (SQL.eq (toSQL T.userUploadsC.userId) (SQL.string id))
      _ -> missing
    joinTracks = innerJoin T.tracks (SQL.eq (toSQL T.userUploadsC.trackId) (toSQL T.tracksC.id))
  counts <- run ctx.db (selectFieldsFrom { total: SQL.template ["count(distinct ", ")::int"] [toSQL T.tracksC.id] } T.userUploads # joinTracks # where_ filters) :: Aff (Array { total :: Int })
  let total = fromMaybe 0 (_.total <$> A.head counts)
  let target = min (Int.toNumber total) opts.limit
  liftEffect (Log.info (show total <> " uploaded track(s) missing " <> (if opts.onlyFingerprint then "a fingerprint" else "key/bpm/fingerprint")
    <> (if Number.isFinite opts.limit then ", limited to " <> showNumber target else "") <> (if opts.dryRun then " — DRY RUN, nothing will be written" else "")))
  started <- liftEffect nowMs
  let
    finish counters = do
      now <- liftEffect nowMs
      liftEffect (Log.success ("done in " <> eta ((now - started) / 1000.0) <> ": " <> show counters.processed <> " analyzed, " <> show counters.filled <> " filled, " <> show counters.failed <> " without result, " <> show counters.downloadFailed <> " download failure(s)" <> if opts.dryRun then " (dry run — nothing written)" else ""))
      pure counters
    loop cursor seen checked counters
      | not (Int.toNumber counters.processed < target) = finish counters
      | otherwise = do
          rows <- run ctx.db (selectFieldsFrom
            { uploadId: T.userUploadsC.id, r2Key: T.userUploadsC.r2Key, mimeType: T.userUploadsC.mimeType, userId: T.userUploadsC.userId
            , storageProviderId: T.userUploadsC.storageProviderId, trackId: T.tracksC.id, title: T.tracksC.title, artist: T.tracksC.artist } T.userUploads
            # joinTracks # where_ (SQL.and (SQL.gt (toSQL T.userUploadsC.id) (SQL.string cursor)) filters)
            # orderBy [SQL.asc (toSQL T.userUploadsC.id)] # limit (opts.batchSize * 4)) :: Aff (Array Upload)
          if A.null rows then finish counters
          else do
            let selected = selectBatch (min (Int.toNumber opts.batchSize) (target - Int.toNumber counters.processed)) seen rows
            if A.null selected.batch then loop selected.cursor selected.seen checked counters
            else do
              liftEffect (Log.info ("downloading " <> show (A.length selected.batch) <> " file(s)…"))
              downloads <- parTraverse (\row -> do
                result <- attempt (ops.download row)
                case result of
                  Right buffer -> pure (Just { row, buffer })
                  Left e -> do
                    liftEffect (Log.warnF ("✖ download failed " <> row.r2Key <> ":") [errorToForeign e])
                    pure Nothing) selected.batch
              let items = A.catMaybes downloads
              let downloaded = counters { downloadFailed = counters.downloadFailed + A.length selected.batch - A.length items }
              if A.null items then loop selected.cursor selected.seen checked downloaded
              else do
                results <- ops.analyze (map (\{ row, buffer } -> { id: notNull row.trackId, buffer, extensionHint: toNullable (extension row.mimeType) }) items) \p -> do
                  let
                    id = fromMaybe "?" (toMaybe p.id)
                    row = A.find (\item -> item.row.trackId == id) items
                    label = fromMaybe id (map (\item -> item.row.title <> " — " <> item.row.artist) row)
                    done = counters.processed + p.completed
                    pct = if target > 0.0 then toFixed 1 (Int.toNumber done / target * 100.0) else "0.0"
                    tag = "[" <> padStart (CU.length (showNumber target)) (show done) <> "/" <> showNumber target <> " " <> padStart 5 pct <> "%]"
                  if p.ok then Log.info ("✔ " <> tag <> " " <> padEnd 4 (fromMaybe "?" (toMaybe p.key)) <> " "
                    <> fromMaybe "    ? bpm" (map (\bpm -> padStart 5 (toFixed 1 bpm) <> " bpm") (toMaybe p.bpm)) <> "  " <> (if p.fingerprint then "fp" else "  ") <> "  " <> label)
                  else Log.warn ("✖ " <> tag <> " " <> label <> ": " <> fromMaybe "undefined" (toMaybe p.error))
                let sample = A.head (A.mapMaybe (toMaybe <<< _.analysis) results)
                when (not checked) case sample of
                  Just value | not (Analysis.supportsFingerprint value) -> throwError (error "@rocksky/analysis is built without fingerprint support — rebuild it with `bun run build` in crates/analysis-node, then run this again")
                  _ -> pure unit
                next <- foldM (\state result -> do
                  let advanced = state { processed = state.processed + 1 }
                  case toMaybe result.analysis of
                    Just value | result.ok && (isJust (toMaybe value.key) || isJust (toMaybe value.bpm) || isJust (toMaybe value.fingerprint)) -> do
                      unless opts.dryRun (ops.store (fromMaybe "" (toMaybe result.id)) value)
                      pure (advanced { filled = advanced.filled + 1 })
                    _ -> pure (advanced { failed = advanced.failed + 1 })) downloaded results
                now <- liftEffect nowMs
                let elapsed = (now - started) / 1000.0
                let rate = Int.toNumber next.processed / elapsed
                liftEffect (Log.info ("progress: " <> show next.processed <> "/" <> showNumber target <> " analyzed · " <> show next.filled <> " filled · " <> show next.failed <> " without result · " <> show next.downloadFailed <> " download failure(s) · " <> toFixed 2 rate <> " tracks/s · ETA " <> eta (if rate > 0.0 then (target - Int.toNumber next.processed) / rate else 0.0 / 0.0)))
                loop selected.cursor selected.seen (checked || isJust sample) next
  loop "" Set.empty false { processed: 0, filled: 0, failed: 0, downloadFailed: 0 }

main :: Effect Unit
main = runScript do
  ctx <- createContext
  loaded <- loadAnalysisModule
  case loaded of
    Nothing -> do
      liftEffect (Log.error "@rocksky/analysis native binding is not built — run `bun run build` in crates/analysis-node first")
      exit 1
    Just analysis -> do
      batchSize <- liftEffect (Int.floor <$> envNumber "BACKFILL_BATCH_SIZE" 8.0)
      count <- liftEffect (envLimit "BACKFILL_LIMIT")
      userId <- liftEffect (envString "BACKFILL_USER_ID")
      dryRun <- liftEffect (envFlag "BACKFILL_DRY_RUN" "1")
      onlyFingerprint <- liftEffect (envFlag "BACKFILL_ONLY" "fingerprint")
      timeout <- liftEffect (Int.floor <$> envNumber "BACKFILL_DOWNLOAD_TIMEOUT_MS" 90000.0)
      download <- liftEffect (cachedDownload ctx timeout)
      void (backfill ctx { batchSize, limit: count, userId, dryRun, onlyFingerprint }
        { download, analyze: Analysis.analyzeBatch analysis, store: \id a -> storeTrackAnalysis ctx id a.key a.bpm a.fingerprint })
      exit 0
