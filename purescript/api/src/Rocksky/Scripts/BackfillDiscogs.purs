module Rocksky.Scripts.BackfillDiscogs (main, backfill, parseOffset, pendingAfter, Options, Counters) where

import Prelude
import Consola as Log
import Data.Array as A
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Number as Number
import Data.String.Regex (regex, test)
import Data.String.Regex.Flags (noFlags)
import Data.Either (Either(..))
import Drizzle.Builder (limit, offsetNumber, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.DiscogsEnrichment (DiscogsLookup(..), enrichAlbumWithDiscogs)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.PgConnectionRecovery (retryPgConnection)
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Scripts.Common (envNumber, envLimit, envFlag, exit, nowMs, parseArgs, scriptArgs, runScript, showNumber, toFixed)

type Options = { offset :: Number, perMinute :: Number, limit :: Number, dryRun :: Boolean }
type Counters = { processed :: Int, matched :: Int, missed :: Int, failed :: Int, skipped :: Int }

parseOffset :: String -> Either String Number
parseOffset raw = case regex "^\\d+$" noFlags, Number.fromString raw of
  Right re, Just n | test re raw && Number.isFinite n && n <= 9007199254740991.0 && n == Number.floor n -> Right n
  _, _ -> Left "--cursor must be a non-negative integer offset"

pendingAfter :: Maybe String -> SQL.SQL
pendingAfter cursor = case cursor of
  Just id | id /= "" -> SQL.and (SQL.isNull (toSQL T.albumsC.discogsReleaseId))
    (SQL.template ["(", ", ", ") > (SELECT xata_createdat, xata_id FROM albums WHERE xata_id = ", ")"] [toSQL T.albumsC.createdAt, toSQL T.albumsC.id, SQL.string id])
  _ -> SQL.isNull (toSQL T.albumsC.discogsReleaseId)

retryDb :: forall a. String -> Aff a -> Aff a
retryDb label = retryPgConnection { attempts: 5, onRetry: \n delay -> Log.warn (label <> ": database connection lost, retry " <> show n <> "/5 in " <> showNumber (Int.toNumber delay / 1000.0) <> "s") }

eta :: Number -> String
eta seconds
  | not (Number.isFinite seconds) = "unknown"
  | otherwise = let m = Number.floor (seconds / 60.0)
                    s = Number.round (seconds - m * 60.0)
                in if m > 0.0 then showNumber m <> "m " <> showNumber s <> "s" else showNumber s <> "s"

backfill :: Context -> Options -> (SelectAlbum -> Aff DiscogsLookup) -> (Int -> Aff Unit) -> Aff Counters
backfill ctx opts enrich pause = do
  counts <- retryDb "Count pending albums" (run ctx.db (selectFieldsFrom { count: SQL.count } T.albums # where_ (pendingAfter Nothing))) :: Aff (Array { count :: Int })
  let pending = fromMaybe 0 (_.count <$> A.head counts)
  let target = min (max 0.0 (Int.toNumber pending - opts.offset)) opts.limit
  let spacing = Int.ceil (60000.0 / max opts.perMinute 1.0)
  liftEffect (Log.info (show pending <> " album(s) without a Discogs link · starting offset " <> showNumber opts.offset <> " · asking " <> showNumber opts.perMinute <> "/min · ETA " <> eta (target * Int.toNumber spacing / 1000.0) <> if opts.dryRun then " (dry run)" else ""))
  started <- liftEffect nowMs
  let
    finish counters = do
      now <- liftEffect nowMs
      liftEffect (Log.success ("done in " <> eta ((now - started) / 1000.0) <> ": " <> show counters.processed <> " album(s) · " <> show counters.matched <> " matched · " <> show counters.missed <> " without a match · " <> show counters.skipped <> " incomplete · " <> show counters.failed <> " unavailable" <> if opts.dryRun then " (dry run — nothing written)" else ""))
      pure counters
    page cursor counters
      | not (Int.toNumber counters.processed < target) = finish counters
      | otherwise = do
          rows <- retryDb "Read album page" (run ctx.db (selectFrom T.albums # where_ (pendingAfter cursor)
            # orderBy [SQL.asc (toSQL T.albumsC.createdAt), SQL.asc (toSQL T.albumsC.id)] # limit 200
            # offsetNumber (maybe opts.offset (const 0.0) cursor))) :: Aff (Array SelectAlbum)
          if A.null rows then finish counters else do
            next <- process rows cursor counters
            page next.cursor next.counters
    process rows cursor counters
      | Int.toNumber counters.processed >= target = pure { cursor, counters }
      | otherwise = case A.uncons rows of
          Nothing -> pure { cursor, counters }
          Just { head: album, tail } -> do
            let label = album.artist <> " - " <> album.title
            let tag = "[" <> showNumber (opts.offset + Int.toNumber counters.processed + 1.0) <> "/" <> showNumber (opts.offset + target) <> "] " <> label
            next <- if opts.dryRun then do
              liftEffect (Log.info ("[" <> showNumber (opts.offset + Int.toNumber counters.processed + 1.0) <> "/" <> showNumber (opts.offset + target) <> "] would ask for " <> label))
              pure (counters { processed = counters.processed + 1 })
            else do
              let attempt n = do
                    result <- retryDb ("Discogs album " <> album.id) (enrich album)
                    case result of
                      Unavailable | n < 3 -> do
                        liftEffect (Log.warn ("discogs unavailable, retrying " <> label <> " in 1m 0s"))
                        pause 60000
                        attempt (n + 1)
                      _ -> pure result
              result <- attempt 1
              let advanced = counters { processed = counters.processed + 1 }
              counted <- case result of
                Matched release -> liftEffect (Log.success (tag <> " → " <> show release.discogsId)) *> pure (advanced { matched = advanced.matched + 1 })
                Missed -> liftEffect (Log.info (tag <> " → no match")) *> pure (advanced { missed = advanced.missed + 1 })
                Skipped -> liftEffect (Log.info (tag <> " → incomplete album")) *> pure (advanced { skipped = advanced.skipped + 1 })
                Unavailable -> liftEffect (Log.error (tag <> " → discogs unavailable")) *> pure (advanced { failed = advanced.failed + 1 })
              when (counted.processed `mod` 25 == 0) do
                now <- liftEffect nowMs
                let rate = Int.toNumber counted.processed / ((now - started) / 1000.0)
                liftEffect (Log.info ("progress: " <> show counted.processed <> "/" <> showNumber target <> " · " <> show counted.matched <> " matched · " <> show counted.missed <> " without a match · " <> show counted.failed <> " unavailable · " <> toFixed 1 (rate * 60.0) <> "/min · ETA " <> eta ((target - Int.toNumber counted.processed) / max rate 1.0e-9)))
              pause spacing
              pure counted
            process tail (Just album.id) next
  page Nothing { processed: 0, matched: 0, missed: 0, skipped: 0, failed: 0 }

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  parsed <- liftEffect (parseArgs (F.toForeign { args, options: { cursor: { type: "string" } }, strict: true, allowPositionals: false }))
  offset <- case parseOffset (fromMaybe "0" (F.readStringAt "values.cursor" parsed)) of
    Left message -> throwError (error message)
    Right value -> pure value
  unless env."DISCOGS_ENRICHMENT_ENABLED" do
    liftEffect (Log.info "Discogs enrichment is disabled. Set DISCOGS_ENRICHMENT_ENABLED=true to run the backfill.")
    exit 0
  perMinute <- liftEffect (envNumber "BACKFILL_ALBUMS_PER_MINUTE" 18.0)
  count <- liftEffect (envLimit "BACKFILL_LIMIT")
  dryRun <- liftEffect (envFlag "BACKFILL_DRY_RUN" "1")
  void (backfill ctx { offset, perMinute, limit: count, dryRun } (\album -> enrichAlbumWithDiscogs ctx album.artist album.title (Just album.id)) sleep)
  exit 0
