module Rocksky.Scripts.BackfillIsrcMbid (main, backfill, processTrackRow, buildWhere, Options, TrackRow, Stats) where

import Prelude
import Consola as Log
import Control.Parallel (parTraverse_)
import Data.Array as A
import Data.Either (Either(..))
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, null, toMaybe)
import Data.Number as Number
import Data.String as String
import Data.Foldable (foldl)
import Drizzle.Builder (limitNumber, offsetNumber, orderBy, run, runUpdate, selectFieldsFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, delay, error, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (message)
import Effect.Ref as Ref
import Data.Time.Duration (Milliseconds(..))
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Matching (MatchedCandidate, matchTrack, matchingRequest)
import Rocksky.Schema as T
import Rocksky.Scripts.Common (envNumber, envLimit, envString, exit, nowMs, runScript, showNumber, toFixed)

type Options = { pageSize :: Number, concurrency :: Number, delayMs :: Number, limit :: Number, fillMb :: Boolean, fillIsrc :: Boolean, artist :: String, album :: String }
type TrackRow = { id :: String, title :: String, artist :: String, album :: String, mbId :: Nullable String, isrc :: Nullable String }
type Stats = { processed :: Number, mb :: Number, isrc :: Number, failed :: Number, totalTarget :: Number, startedAt :: Number }

buildWhere :: Options -> SQL.SQL
buildWhere opts = foldl SQL.and base filters
  where
  base = SQL.or (if opts.fillMb then SQL.isNull (toSQL T.tracksC.mbId) else SQL.raw "false") (if opts.fillIsrc then SQL.isNull (toSQL T.tracksC.isrc) else SQL.raw "false")
  filters = (if opts.artist == "" then [] else [SQL.ilike (toSQL T.tracksC.artist) (SQL.string ("%" <> opts.artist <> "%"))]) <>
    (if opts.album == "" then [] else [SQL.ilike (toSQL T.tracksC.album) (SQL.string ("%" <> opts.album <> "%"))])

processTrackRow :: Context -> Options -> (TrackRow -> Aff (Nullable MatchedCandidate)) -> Aff Unit -> TrackRow -> Aff { mb :: Boolean, isrc :: Boolean }
processTrackRow ctx opts match pause row = do
  candidate <- match row
  let ids = _.identifiers <$> toMaybe candidate
  let mb = if opts.fillMb && fromMaybe "" (toMaybe row.mbId) == "" then fromMaybe "" (ids >>= toMaybe <<< _.musicbrainzRecordingId) else ""
  let isrc = if opts.fillIsrc && fromMaybe "" (toMaybe row.isrc) == "" then fromMaybe "" (ids >>= toMaybe <<< _.isrc) else ""
  pause
  if mb == "" && isrc == "" then pure missed else do
    let updates = F.mergeForeign (if mb == "" then F.toForeign {} else F.toForeign { mbId: mb }) (if isrc == "" then F.toForeign {} else F.toForeign { isrc })
    result <- attempt (runUpdate ctx.db (updateForeign T.tracks updates # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string row.id))))
    case result of
      Left e -> do
        let cause = F.toForeign e
        let code = fromMaybe "" (F.readStringAt "cause.code" cause)
        let detail key = fromMaybe "" ((\s -> " " <> key <> "=" <> s) <$> F.readStringAt ("cause." <> key) cause)
        liftEffect (Log.warn ("[db] update failed for " <> row.id <> " (" <> row.title <> "): " <> message e <> if code == "" then "" else " | pg " <> code <> detail "constraint" <> detail "detail"))
        pure missed
      Right _ -> do
        liftEffect (Log.success ("[db] " <> row.id <> " " <> row.title <> " — " <> row.artist <> " mb_id=" <> mb <> " isrc=" <> isrc))
        pure { mb: mb /= "", isrc: isrc /= "" }
  where
  missed = { mb: false, isrc: false }

progress :: Stats -> Effect String
progress stats = do
  now <- nowMs
  let rate = stats.processed / max 1.0 ((now - stats.startedAt) / 1000.0)
  let eta = if rate > 0.0 then Number.round (max 0.0 (stats.totalTarget - stats.processed) / rate / 60.0) else 0.0
  let pct = if stats.totalTarget > 0.0 then Number.floor (stats.processed / stats.totalTarget * 100.0) else 0.0
  pure (showNumber pct <> "% " <> showNumber stats.processed <> "/" <> showNumber stats.totalTarget <> " · mb=" <> showNumber stats.mb <> " isrc=" <> showNumber stats.isrc <> " failed=" <> showNumber stats.failed <> " · " <> toFixed 1 rate <> "/s · ETA ~" <> showNumber eta <> "m")

backfill :: Context -> Options -> (TrackRow -> Aff (Nullable MatchedCandidate)) -> Aff Unit -> Aff Stats
backfill ctx opts match pause = do
  liftEffect (Log.start ("Backfill starting · mbid=" <> show opts.fillMb <> " isrc=" <> show opts.fillIsrc <> " · artist=" <> opts.artist <> " album=" <> opts.album <> " · concurrency=" <> showNumber opts.concurrency <> " · page=" <> showNumber opts.pageSize))
  unless (opts.fillMb || opts.fillIsrc) (throwError (error "BACKFILL_ONLY=neither — nothing to do."))
  liftEffect (Log.info "Counting candidate tracks…")
  counts <- run ctx.db (selectFieldsFrom { n: SQL.raw "count(*)::int" } T.tracks # where_ (buildWhere opts)) :: Aff (Array { n :: Number })
  startedAt <- liftEffect nowMs
  let totalTarget = min opts.limit (fromMaybe 0.0 (_.n <$> A.head counts))
  liftEffect (Log.info ("Found " <> showNumber (fromMaybe 0.0 (_.n <$> A.head counts)) <> " candidate track(s); will process up to " <> showNumber totalTarget <> "."))
  stats <- liftEffect (Ref.new { processed: 0.0, mb: 0.0, isrc: 0.0, failed: 0.0, totalTarget, startedAt })
  let worker id queue = do
        liftEffect (Log.info ("[w" <> show id <> "] start"))
        let go = do
              claim <- liftEffect do
                current <- Ref.read stats
                rows <- Ref.read queue
                case A.uncons rows of
                  Nothing -> pure Nothing
                  Just r | current.processed < opts.limit -> do
                    Ref.write r.tail queue
                    Ref.write (current { processed = current.processed + 1.0 }) stats
                    pure (Just r.head)
                  _ -> pure Nothing
              case claim of
                Nothing -> pure unit
                Just row -> do
                  result <- attempt (processTrackRow ctx opts match pause row)
                  liftEffect do
                    case result of
                      Left e -> do
                        Ref.modify_ (\s -> s { failed = s.failed + 1.0 }) stats
                        Log.errorF ("[w" <> show id <> "] error on " <> row.id) [F.toForeign e]
                      Right r -> Ref.modify_ (\s -> s { mb = s.mb + if r.mb then 1.0 else 0.0, isrc = s.isrc + if r.isrc then 1.0 else 0.0, failed = s.failed + if not r.mb && not r.isrc then 1.0 else 0.0 }) stats
                    current <- Ref.read stats
                    when (current.processed / 25.0 == Number.floor (current.processed / 25.0)) (progress current >>= Log.info)
                  go
        go
        remaining <- liftEffect (Ref.read queue)
        when (A.null remaining) (liftEffect (Log.info ("[w" <> show id <> "] done")))
  let page offset = do
        current <- liftEffect (Ref.read stats)
        when (current.processed < opts.limit) do
          rows <- run ctx.db (selectFieldsFrom { id: T.tracksC.id, title: T.tracksC.title, artist: T.tracksC.artist, album: T.tracksC.album, mbId: T.tracksC.mbId, isrc: T.tracksC.isrc } T.tracks
            # where_ (buildWhere opts) # orderBy [toSQL T.tracksC.createdAt] # offsetNumber offset # limitNumber (min opts.pageSize (opts.limit - current.processed))) :: Aff (Array TrackRow)
          unless (A.null rows) do
            queue <- liftEffect (Ref.new rows)
            parTraverse_ (\id -> worker id queue) (A.mapWithIndex (\i _ -> i + 1) (A.replicate (max 0 (Int.floor opts.concurrency)) unit))
            next <- liftEffect (Ref.read stats)
            liftEffect (progress next >>= Log.info)
            -- Source uses cumulative identifier counts, including twice-counted rows.
            page (offset + max 0.0 (Int.toNumber (A.length rows) - next.mb - next.isrc))
  when (totalTarget /= 0.0) (page 0.0)
  result <- liftEffect (Ref.read stats)
  now <- liftEffect nowMs
  let seconds = max 1.0 ((now - startedAt) / 1000.0)
  liftEffect (Log.box ("Backfill complete\nProcessed: " <> showNumber result.processed <> "\nmb_id filled: " <> showNumber result.mb <> "\nisrc filled: " <> showNumber result.isrc <> "\nSkipped: " <> showNumber result.failed <> "\nDuration: " <> showNumber (Number.round seconds) <> "s (" <> toFixed 1 (result.processed / seconds) <> "/s)"))
  pure result

main :: Effect Unit
main = runScript do
  ctx <- createContext
  opts <- liftEffect do
    pageSize <- envNumber "BACKFILL_PAGE_SIZE" 500.0
    concurrency <- envNumber "BACKFILL_CONCURRENCY" 4.0
    delayMs <- envNumber "BACKFILL_MATCHING_DELAY" 1100.0
    limit <- envLimit "BACKFILL_LIMIT"
    only <- String.toLower <<< fromMaybe "both" <$> envString "BACKFILL_ONLY"
    artist <- String.trim <<< fromMaybe "" <$> envString "BACKFILL_ARTIST"
    album <- String.trim <<< fromMaybe "" <$> envString "BACKFILL_ALBUM"
    pure { pageSize, concurrency, delayMs, limit, fillMb: only == "both" || only == "mbid", fillIsrc: only == "both" || only == "isrc", artist, album }
  void (backfill ctx opts (\row -> matchingRequest (F.toForeign row) >>= \request -> matchTrack ctx request null) (delay (Milliseconds opts.delayMs)))
  exit 0
