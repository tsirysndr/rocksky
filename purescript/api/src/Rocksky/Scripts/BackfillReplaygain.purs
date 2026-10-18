module Rocksky.Scripts.BackfillReplaygain (main, backfill, Options, Operations, Counters, extension) where

import Prelude
import Aws.S3 as S3
import Consola as Log
import Data.Array as A
import Data.Either (Either(..))
import Data.Int as Int
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (notNull, null, toMaybe)
import Drizzle.Builder (limit, orderBy, run, runUpdate, selectFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import MusicMetadata as Metadata
import Node.Buffer as Buffer
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Schema as T
import Rocksky.Schema.UserUploads (SelectUserUpload)
import Rocksky.Scripts.Common (envNumber, envLimit, envString, envFlag, exit, runScript)
import Rocksky.Uploads.Replaygain (ensureReplayGain, replaygainExts)

foreign import sameBuffer :: Buffer.Buffer -> Buffer.Buffer -> Boolean

type Options = { pageSize :: Int, limit :: Number, userId :: Maybe String, dryRun :: Boolean }
type Counters = { scanned :: Int, tagged :: Int, skipped :: Int, failed :: Int }
type Operations =
  { download :: String -> Aff Buffer.Buffer
  , hasGain :: Buffer.Buffer -> String -> Aff Boolean
  , tag :: Buffer.Buffer -> String -> Aff Buffer.Buffer
  , upload :: SelectUserUpload -> Buffer.Buffer -> Aff Unit
  }

extension :: String -> Maybe String
extension = case _ of
  "audio/mpeg" -> Just "mp3"
  "audio/flac" -> Just "flac"
  "audio/mp4" -> Just "m4a"
  "audio/x-m4a" -> Just "m4a"
  "audio/ogg" -> Just "ogg"
  _ -> Nothing

backfill :: Context -> Options -> Operations -> Aff Counters
backfill ctx options ops = pages "" { scanned: 0, tagged: 0, skipped: 0, failed: 0 }
  where
  report prefix c = liftEffect (Log.info (prefix <> ": scanned=" <> show c.scanned <> " tagged=" <> show c.tagged <> " skipped=" <> show c.skipped <> " failed=" <> show c.failed))
  pages cursor counters
    | not (Int.toNumber counters.tagged < options.limit) = report "done" counters *> pure counters
    | otherwise = do
        let ownership = case options.userId of
              Just id | id /= "" -> SQL.eq (toSQL T.userUploadsC.userId) (SQL.string id)
              _ -> SQL.raw "true"
        rows <- run ctx.db (selectFrom T.userUploads
          # where_ (SQL.and ownership (SQL.and (SQL.gt (toSQL T.userUploadsC.id) (SQL.string cursor)) (SQL.isNull (toSQL T.userUploadsC.storageProviderId))))
          # orderBy [SQL.asc (toSQL T.userUploadsC.id)] # limit options.pageSize) :: Aff (Array SelectUserUpload)
        case A.last rows of
          Nothing -> report "done" counters *> pure counters
          Just last -> do
            next <- process rows counters
            report "progress" next
            pages last.id next
  process rows counters
    | Int.toNumber counters.tagged >= options.limit = pure counters
    | otherwise = case A.uncons rows of
        Nothing -> pure counters
        Just { head: row, tail } -> do
          let scanned = counters { scanned = counters.scanned + 1 }
          next <- case extension row.mimeType of
            Just ext | A.elem ext replaygainExts -> do
              result <- attempt do
                buf <- ops.download row.r2Key
                present <- ops.hasGain buf row.mimeType
                if present then pure (scanned { skipped = scanned.skipped + 1 })
                else if options.dryRun then do
                  liftEffect (Log.info ("[dry-run] would tag " <> row.r2Key))
                  pure (scanned { tagged = scanned.tagged + 1 })
                else do
                  tagged <- ops.tag buf ext
                  if sameBuffer buf tagged then do
                    liftEffect (Log.warn ("analysis failed: " <> row.r2Key))
                    pure (scanned { failed = scanned.failed + 1 })
                  else do
                    ops.upload row tagged
                    size <- liftEffect (Buffer.size tagged)
                    runUpdate ctx.db (update T.userUploads { fileSize: size } # where_ (SQL.eq (toSQL T.userUploadsC.id) (SQL.string row.id)))
                    liftEffect (Log.success ("tagged " <> row.r2Key))
                    pure (scanned { tagged = scanned.tagged + 1 })
              case result of
                Right value -> pure value
                Left e -> do
                  liftEffect (Log.warnF ("failed " <> row.r2Key <> ":") [errorToForeign e])
                  pure (scanned { failed = scanned.failed + 1 })
            _ -> pure (scanned { skipped = scanned.skipped + 1 })
          process tail next

main :: Effect Unit
main = runScript do
  ctx <- createContext
  pageSize <- liftEffect (Int.floor <$> envNumber "BACKFILL_PAGE_SIZE" 100.0)
  count <- liftEffect (envLimit "BACKFILL_LIMIT")
  userId <- liftEffect (envString "BACKFILL_USER_ID")
  dryRun <- liftEffect (envFlag "BACKFILL_DRY_RUN" "1")
  s3 <- liftEffect (S3.newClient { region: env."S3_REGION", endpoint: notNull env."S3_ENDPOINT", forcePathStyle: null
    , credentials: { accessKeyId: env."S3_ACCESS_KEY_ID", secretAccessKey: env."S3_SECRET_ACCESS_KEY" } })
  let operations =
        { download: \key -> _.body <$> S3.getObject s3 env."S3_BUCKET_NAME" key
        , hasGain: \buf mime -> (isJust <<< toMaybe <<< _.replaygainTrackGain <<< _.common) <$> Metadata.parseBuffer buf { mimeType: notNull mime, duration: false }
        , tag: ensureReplayGain
        , upload: \row buf -> do
            size <- liftEffect (Buffer.size buf)
            S3.putObject s3 { bucket: env."S3_BUCKET_NAME", key: row.r2Key, body: buf, contentType: notNull row.mimeType, contentLength: notNull (Int.toNumber size) }
        }
  void (backfill ctx { pageSize, limit: count, userId, dryRun } operations)
  exit 0
