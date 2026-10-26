module Rocksky.Cli.Command.Import (run, retryRateLimit, runPool) where

import Prelude
import Control.Parallel (parTraverse_)
import Control.Promise (Promise, toAffE)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toNullable)
import Data.Number as Number
import Data.String (Pattern(..), contains, toLower)
import Data.Tuple (Tuple(..))
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Aff (Aff, delay, finally, throwError, try)
import Effect.Class (liftEffect)
import Effect.Exception (error, message)
import Effect.Ref as Ref
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Cli.Client as Client
import Rocksky.Cli.Import.Checkpoint as Checkpoint
import Rocksky.Cli.Import.Parsers as Parsers
import Rocksky.Cli.Import.Scrobble as Scrobble
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

foreign import data Session :: Type
foreign import openImpl :: String -> String -> Effect (Promise Session)
foreign import closeImpl :: Session -> Effect (Promise Unit)
foreign import configure :: Session -> Foreign -> Effect Foreign
foreign import publishImpl :: Session -> Foreign -> Effect (Promise Unit)
foreign import loadCheckpoint :: String -> Effect (Nullable Checkpoint.Checkpoint)
foreign import saveCheckpoint :: Checkpoint.Checkpoint -> Effect Unit
foreign import clearCheckpoint :: String -> Effect Unit
foreign import absolutePath :: String -> String
foreign import now :: Effect String
foreign import watchSignals :: Effect Unit -> Effect (Effect Unit)
foreign import preview :: Array Foreign -> Effect Unit

retryRateLimit :: forall a. Aff a -> Aff a
retryRateLimit action = loop 0
  where
  loop attempt = do
    result <- try action
    case result of
      Right value -> pure value
      Left err -> do
        let text = toLower (message err)
        if attempt < 6 && Array.any (\part -> contains (Pattern part) text) [ "rate limit", "ratelimit", "rate-limit", "too many requests", "429" ] then do
          let backoff = min 60000.0 (1000.0 * Number.pow 2.0 (Int.toNumber attempt))
          liftEffect $ Runtime.printError ("Rate-limited by the PDS; retrying in " <> show (Int.floor (backoff / 1000.0)) <> "s")
          delay (Milliseconds backoff)
          loop (attempt + 1)
        else throwError err

runPool :: forall a. Array a -> Int -> (a -> Int -> Aff Unit) -> Aff Unit
runPool items size worker = do
  next <- liftEffect $ Ref.new 0
  let
    runWorker _ = do
      i <- liftEffect do
        value <- Ref.read next
        Ref.write (value + 1) next
        pure value
      case Array.index items i of
        Nothing -> pure unit
        Just item -> worker item i *> runWorker unit
  parTraverse_ runWorker (Array.replicate (min (max 1 size) (Array.length items)) unit)

run :: String -> Foreign -> Aff Unit
run file options = do
  let
    format = toLower (Client.field "format" options)
    dryRun = fromMaybe false (F.readBooleanAt "dryRun" options)
    restart = fromMaybe false (F.readBooleanAt "restart" options)
    numeric name fallback = fromMaybe fallback (F.path name options >>= Number.fromString <<< F.stringValue)
    minSeconds = numeric "minSeconds" 30.0
    requestedConcurrency = numeric "concurrency" 4.0
    concurrency = if Number.isFinite requestedConcurrency then max 1 (Int.floor requestedConcurrency) else 4
  unless (format == "" || format == "spotify" || format == "lastfm") $ throwError $ error ("Unknown --format \"" <> format <> "\". Use \"spotify\" or \"lastfm\".")
  unless (Number.isFinite minSeconds) $ throwError (error "Invalid --min-seconds")
  result <- liftEffect $ Parsers.parseImport file { force: toNullable (if format == "" then Nothing else Just format), minSeconds: toNullable (Just minSeconds) }
  start <- dateOption "from"
  end <- dateOption "to"
  let
    filtered = Array.filter (\s -> maybe true (s.timestamp >= _) start && maybe true (s.timestamp <= _) end) result.scrobbles
    limit = numeric "limit" (Int.toNumber (Array.length filtered))
    listens = if Number.isFinite limit then Array.take (max 0 (Int.floor limit)) filtered else filtered
  print ("Detected " <> (if result.format == "spotify" then "Spotify" else "Last.fm") <> " export — " <> show (Array.length result.scrobbles) <> " scrobbles across " <> show (Array.length result.files) <> " file(s)")
  for_ (Object.toUnfoldable result.skipped :: Array (Tuple String Int)) \(Tuple reason count) -> print ("Skipped " <> show count <> ": " <> reason)
  if Array.null listens then print "Nothing to import after parsing/filtering."
  else if dryRun then do
    liftEffect $ preview (map (F.omitNulls <<< F.toForeign) listens)
    print ("Dry run complete: " <> show (Array.length listens) <> " scrobble(s) would be published (from the start). Nothing was written to your PDS.")
  else do
    identifier <- liftEffect $ Runtime.env "ROCKSKY_IDENTIFIER"
    handle <- liftEffect $ Runtime.env "ROCKSKY_HANDLE"
    password <- liftEffect $ Runtime.env "ROCKSKY_PASSWORD"
    let login = if identifier == "" then handle else identifier
    when (login == "" || password == "") $ throwError (error "Missing credentials. Set ROCKSKY_IDENTIFIER (or ROCKSKY_HANDLE) and ROCKSKY_PASSWORD to your app password.")
    print ("Authenticating as " <> login <> " and building the required repository dedup index…")
    session <- toAffE (openImpl login password)
    finally (toAffE (closeImpl session)) do
      let rate = numeric "rate" 0.0
      policy <- liftEffect $ configure session $
        if F.readBooleanAt "rateLimit" options == Just false then F.toForeign { disabled: true }
        else if Number.isFinite rate && rate > 0.0 then F.toForeign { writesPerHour: rate * 4.0 }
        else F.toForeign {}
      print ("Rate policy: " <> F.stringify policy)
      when restart $ liftEffect (clearCheckpoint file)
      saved <- liftEffect $ loadCheckpoint file
      let identities = map (\s -> { timestamp: s.timestamp, title: s.title, artist: s.artist }) listens
      progress <- liftEffect $ Checkpoint.restoreProgress identities saved
      let
        buildCheckpoint = do
          mark <- Checkpoint.mark progress.tracker
          outstanding <- Checkpoint.outstanding progress.tracker
          updatedAt <- now
          pure
            { source: absolutePath file
            , format: result.format
            , updatedAt
            , cursor: toNullable do
                s <- Array.index identities mark
                pure { timestamp: s.timestamp, title: s.title, artist: s.artist, count: mark + 1 }
            , completed: toNullable $ Just $ Array.mapMaybe (Array.index identities) outstanding
            }
        flush = do
          checkpoint <- buildCheckpoint
          saveCheckpoint checkpoint
      unwatch <- liftEffect $ watchSignals flush
      finally (liftEffect unwatch) do
        failures <- liftEffect $ Ref.new 0
        completed <- liftEffect $ Ref.new 0
        print ("Importing " <> show (Array.length progress.pendingIndices) <> " remaining scrobble(s)")
        runPool progress.pendingIndices concurrency \i _ -> case Array.index listens i of
          Nothing -> pure unit
          Just listen -> do
            published <- try $ retryRateLimit $ toAffE $ publishImpl session (F.omitNulls (F.toForeign listen))
            case published of
              Right _ -> do
                liftEffect $ void $ Checkpoint.complete progress.tracker i
                persisted <- try $ liftEffect flush
                case persisted of
                  Left err -> liftEffect $ Runtime.printError ("Could not save resume checkpoint: " <> message err)
                  Right _ -> pure unit
              Left err -> do
                liftEffect $ Ref.modify_ (_ + 1) failures
                liftEffect $ Runtime.printError ("Rejected: " <> listen.title <> " — " <> listen.artist <> ": " <> Scrobble.formatError (F.toForeign err))
            done <- liftEffect $ Ref.modify (_ + 1) completed
            print (show done <> "/" <> show (Array.length progress.pendingIndices) <> " processed")
        failureCount <- liftEffect $ Ref.read failures
        persisted <- try $ liftEffect flush
        case persisted of
          Left err -> liftEffect $ Runtime.printError ("Could not save resume checkpoint: " <> message err)
          Right _ -> pure unit
        print ("Import complete: " <> show (Array.length progress.pendingIndices - failureCount) <> " succeeded, " <> show failureCount <> " failed")
        when (failureCount > 0 && failureCount == Array.length progress.pendingIndices) $ liftEffect (Runtime.setExitCode 1)
  where
  print = liftEffect <<< Runtime.print
  dateOption name = case F.readStringAt name options of
    Nothing -> pure Nothing
    Just value ->
      let
        parsed = Parsers.timestamp value
      in
        if Number.isFinite parsed then pure (Just parsed) else throwError (error ("Invalid --" <> name <> " date: " <> value))
