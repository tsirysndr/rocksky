module Rocksky.Subscribers.Status where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Either (Either(..))
import Data.Int as Int
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe, toNullable)
import Data.Number as Number
import Data.String (trim)
import Rocksky.Lib.Matching (matches)
import Effect (Effect)
import Effect.Aff (Aff, attempt, launchAff_, throwError)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Effect.Timer (TimeoutId, clearTimeout, setTimeout)
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Nats (Subscription)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Foreign (asNumber, asString, omitNulls, path, readNumberAt, readStringAt, toForeign, undefined)
import Rocksky.Subscribers.Consumer (start)
import Rocksky.Subscribers.Status.Info as Info

type Entry = { token :: Int, key :: String, source :: String, startedAt :: Number, durationMs :: Number }
type State =
  { last :: Ref.Ref (Map.Map String (Maybe Entry)), pending :: Ref.Ref (Map.Map String TimeoutId)
  , limited :: Ref.Ref (Map.Map String Number), serial :: Ref.Ref Int }

newState :: Effect State
newState = { last: _, pending: _, limited: _, serial: _ } <$> Ref.new Map.empty <*> Ref.new Map.empty <*> Ref.new Map.empty <*> Ref.new 0

state :: State
state = unsafePerformEffect newState

now :: Effect Number
now = Date.getTime <$> Date.now

iso :: Number -> Effect String
iso n = Date.toISOString (Date.fromTime n)

cancelPendingDelete :: State -> String -> Effect Unit
cancelPendingDelete s did = do
  pending <- Map.lookup did <$> Ref.read s.pending
  case pending of
    Nothing -> pure unit
    Just timer -> clearTimeout timer *> Ref.modify_ (Map.delete did) s.pending

isRateLimited :: State -> String -> Effect Boolean
isRateLimited s did = do
  limit <- Map.lookup did <$> Ref.read s.limited
  current <- now
  case limit of
    Just until | until /= 0.0 && current < until -> pure true
    _ -> Ref.modify_ (Map.delete did) s.limited $> false

errorStatus :: Foreign -> Maybe Number
errorStatus err = readNumberAt "status" err <|> readNumberAt "response.status" err <|> readNumberAt "error.status" err

numeric :: Foreign -> Number
numeric value = fromMaybe converted (asNumber value)
  where
  converted = case asString value of
    Just raw | trim raw == "" -> 0.0
    Just raw | trim raw == "Infinity" || trim raw == "+Infinity" -> Number.infinity
    Just raw | trim raw == "-Infinity" -> -Number.infinity
    Just raw | matches "^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$" (trim raw) -> fromMaybe Number.nan (Number.fromString raw)
    _ -> Number.nan

headerValue :: String -> Foreign -> Maybe Foreign
headerValue name err = do
  headers <- path "headers" err <|> path "response.headers" err <|> path "error.headers" err
  value <- path name headers
  case asString value, asNumber value of
    Just "", _ -> Nothing
    _, Just n | n == 0.0 || Number.isNaN n -> Nothing
    _, _ -> Just value

resetHeader :: Foreign -> Maybe Foreign
resetHeader err = headerValue "ratelimit-reset" err <|> headerValue "x-ratelimit-reset" err

backoffUntil :: Number -> Foreign -> Number
backoffUntil current err = case resetHeader err of
  Just reset -> numeric reset * 1000.0
  Nothing -> case headerValue "retry-after" err of
    Just retry -> current + numeric retry * 1000.0
    Nothing -> current + 60000.0

rateLimitResetMsg :: Foreign -> Effect String
rateLimitResetMsg err = case resetHeader err of
  Just reset -> do
    let time = numeric reset * 1000.0
    date <- iso time
    current <- now
    pure (" — rate limit resets at " <> date <> " (in " <> show (max 0 (Int.round ((time - current) / 1000.0))) <> "s)")
  Nothing -> case headerValue "retry-after" err of
    Just retry -> pure (" — retry after " <> fromMaybe (show (numeric retry)) (asString retry) <> "s")
    Nothing -> pure ""

applyRateLimit :: State -> String -> Foreign -> Effect Unit
applyRateLimit s did err = do
  current <- now
  Ref.modify_ (Map.insert did (backoffUntil current err)) s.limited

getSwapCid :: Api.Agent -> Aff (Maybe String)
getSwapCid agent = do
  result <- attempt do
    repo <- liftEffect (Api.assertDid agent)
    Api.getRecord agent { repo, collection: "app.rocksky.actor.status", rkey: "self" }
  case result of
    Right record -> pure (toMaybe record.cid)
    Left e -> case readNumberAt "response.status" (toForeign e) <|> readNumberAt "status" (toForeign e) of
      Just code | code == 400.0 || code == 404.0 -> pure Nothing
      _ -> throwError e

clearStatus :: State -> Context -> String -> Aff Unit
clearStatus s ctx did = do
  maybeAgent <- createAgent ctx did
  case maybeAgent of
    Nothing -> liftEffect (Log.warn ("[status] No agent for " <> did <> ", skipping song.stopped"))
    Just agent -> do
      repo <- liftEffect (Api.assertDid agent)
      Api.deleteRecord agent { repo, collection: "app.rocksky.actor.status", rkey: "self" }
      liftEffect do
        Ref.modify_ (Map.insert did Nothing) s.last
        Log.info ("[status] Cleared status for " <> did)

onSongChanged :: Context -> Effect Subscription
onSongChanged ctx = start ctx "rocksky.song.changed" (changed state ctx)

onSongStopped :: Context -> Effect Subscription
onSongStopped ctx = start ctx "rocksky.song.stopped" (stopped state ctx)

changed :: State -> Context -> Foreign -> Aff Unit
changed s ctx payload = do
  let did = fromMaybe "(unknown)" (readStringAt "did" payload)
  result <- attempt do
    limited <- liftEffect (isRateLimited s did)
    unless limited do
      let raw = fromMaybe undefined (path "track" payload)
      let key = fromMaybe "" (readStringAt "name" raw) <> ":" <> Info.artist raw
      let source = Info.source raw
      last <- liftEffect (Map.lookup did <$> Ref.read s.last)
      let unchanged = case last of
            Just (Just previous) -> previous.key == key && previous.source == source
            _ -> false
      unless unchanged do
        resolved <- sequential $ { agent: _, info: _ }
          <$> parallel (createAgent ctx did)
          <*> parallel (Info.resolveTrackInfo ctx raw)
        case resolved.agent of
          Nothing -> liftEffect (Log.warn ("[status] No agent for " <> did <> ", skipping song.changed"))
          Just agent -> writeStatus s ctx did agent raw resolved.info
  case result of
    Right _ -> pure unit
    Left e -> handleFailure s did "song.changed" (toForeign e)

writeStatus :: State -> Context -> String -> Api.Agent -> Foreign -> Info.Info -> Aff Unit
writeStatus s ctx did agent raw info = do
  let track = Info.normalizeTrack raw info
  let duration = fromMaybe 0.0 (readNumberAt "durationMs" track)
  let source = Info.source raw
  let key = fromMaybe "" (readStringAt "name" raw) <> ":" <> Info.artist raw
  started <- liftEffect now
  startedAt <- liftEffect (iso started)
  expiresAt <- if duration /= 0.0 then do
    current <- liftEffect now
    Just <$> liftEffect (iso (current + duration))
    else pure Nothing
  let record = omitNulls (toForeign { "$type": "app.rocksky.actor.status", track, startedAt, expiresAt: toNullable expiresAt })
  swap <- getSwapCid agent
  repo <- liftEffect (Api.assertDid agent)
  void (Api.putRecord agent { repo, collection: "app.rocksky.actor.status", rkey: "self", record, validate: false, swapRecord: Just <$> swap })
  liftEffect do
    token <- Ref.modify (_ + 1) s.serial
    Ref.modify_ (Map.insert did (Just { token, key, source, startedAt: started, durationMs: duration })) s.last
    cancelPendingDelete s did
  when (source == "navidrome") (void (Redis.del ctx.redis ("ws_lastsong:" <> did)))
  when (duration > 0.0) $ liftEffect $ void $ setTimeout (Int.floor (duration + 10000.0)) do
    current <- Map.lookup did <$> Ref.read s.last
    case current of
      Just (Just entry) | entry.key == key && entry.source == source -> Ref.modify_ (Map.delete did) s.last
      _ -> pure unit
  liftEffect (Log.info ("[status] Updated status for " <> did <> ": " <> Info.artist raw <> " – " <> fromMaybe "" (readStringAt "name" raw)))

stopped :: State -> Context -> Foreign -> Aff Unit
stopped s ctx payload = do
  let did = fromMaybe "(unknown)" (readStringAt "did" payload)
  result <- attempt do
    limited <- liftEffect (isRateLimited s did)
    unless limited do
      last <- liftEffect (Map.lookup did <$> Ref.read s.last)
      case last of
        Just Nothing -> pure unit
        _ -> do
          current <- liftEffect now
          let remaining = case last of
                Just (Just entry) | entry.durationMs /= 0.0 -> max 0.0 (entry.startedAt + entry.durationMs - current)
                _ -> 0.0
          if remaining <= 0.0 then clearStatus s ctx did
          else liftEffect do
            cancelPendingDelete s did
            timer <- setTimeout (Int.floor (remaining + 5000.0)) do
              Ref.modify_ (Map.delete did) s.pending
              latest <- Map.lookup did <$> Ref.read s.last
              let token value = case value of
                    Just (Just entry) -> Just entry.token
                    _ -> Nothing
              when (token latest == token last) $ launchAff_ do
                outcome <- attempt (clearStatus s ctx did)
                case outcome of
                  Left e -> liftEffect (Log.errorF ("[status] deferred clear failed for " <> did <> ":") [toForeign e])
                  Right _ -> pure unit
            Ref.modify_ (Map.insert did timer) s.pending
            Log.info ("[status] deferred clear for " <> did <> " — " <> show (Int.round (remaining / 1000.0)) <> "s of the track left")
  case result of
    Right _ -> pure unit
    Left e -> case errorStatus (toForeign e) of
      Just code | code == 400.0 || code == 404.0 -> pure unit
      _ -> handleFailure s did "song.stopped" (toForeign e)

handleFailure :: State -> String -> String -> Foreign -> Aff Unit
handleFailure s did action err = liftEffect case errorStatus err of
  Just 429.0 -> do
    applyRateLimit s did err
    detail <- rateLimitResetMsg err
    Log.warn ("[status] " <> action <> " rate limited for " <> did <> detail)
  _ -> Log.errorF ("[status] Error handling " <> action <> " for " <> did) [err]
