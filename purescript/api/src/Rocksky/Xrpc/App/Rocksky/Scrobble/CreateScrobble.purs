module Rocksky.Xrpc.App.Rocksky.Scrobble.CreateScrobble (register, handlerWith, Dependencies) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Consola as Log
import Data.Either (Either(..))
import Data.Foldable (traverse_)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.String.CodeUnits (length)
import Effect (Effect)
import Effect.Aff (Aff, attempt, message, throwError)
import Effect.Class (liftEffect)
import Express as Express
import Foreign.Object as Object
import OpenTelemetry.Api as Trace
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Agent (createAgent, pdsSessionExpired)
import Rocksky.Lib.DurableSubmission (enqueueSubmission, isSubmissionUnavailable)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.ScrobbleGuard as Guard
import Rocksky.Types.Track (Track, parseTrack, formatValidationError)
import Rocksky.Xrpc.Util as Util

type Dependencies =
  { guard :: String -> Aff Unit
  , agentAvailable :: String -> Aff Boolean
  , enqueue :: String -> Track -> Maybe String -> Boolean -> Aff String
  }

handlerWith :: Dependencies -> Xrpc.HandlerInput -> Aff Xrpc.HandlerOutput
handlerWith deps input = do
  span <- liftEffect Trace.getActiveSpan
  let event name = liftEffect (traverse_ (\s -> Trace.addEvent s name) span)
      attribute key value = liftEffect (traverse_ (\s -> Trace.setAttribute s key value) span)
  case Util.authDid input of
    Nothing -> event "missing_did" $> Util.missingDid
    Just did -> do
      attribute "user.did" did
      result <- attempt do
        case parseTrack (fromMaybe F.undefined (Util.inputBody input)) of
          Left errors -> do
            event "validation_failed"
            liftEffect (Log.warn ("[createScrobble] invalid input for " <> did <> ": " <> formatValidationError errors))
            pure (Xrpc.Failure 400 (formatValidationError errors))
          Right track -> do
            attribute "scrobble.track" track.title
            attribute "scrobble.artist" track.artist
            attribute "scrobble.album" track.album
            guarded <- attempt (deps.guard did)
            case guarded of
              Left e -> case Guard.fromError e of
                Just (Guard.ScrobbleBotFlagged _) -> do
                  event "rejected_bot_flagged"
                  liftEffect (Log.warn ("[createScrobble] rejected bot-flagged account " <> did))
                  pure (Xrpc.Failure 429 Guard.scrobbleBotFlaggedMessage)
                Just (Guard.ScrobbleBlocked block) -> do
                  liftEffect (traverse_ (\s -> Trace.addEventWith s "rejected_scrobble_blocked" (Object.singleton "retry_after.seconds" (F.toForeign block.retryAfter))) span)
                  liftEffect (Log.warn ("[createScrobble] blocked suspected bot " <> did <> " — retry after " <> show block.retryAfter <> "s"))
                  pure (Xrpc.Failure 429 (Guard.scrobbleBlockedMessage block.retryAfter))
                Nothing -> throwError e
              Right _ -> do
                available <- deps.agentAvailable did
                if not available then do
                  event "pds_session_expired"
                  liftEffect (Log.warn ("[createScrobble] no agent for " <> did <> ", returning 401"))
                  pure (Xrpc.Failure 401 pdsSessionExpired.message)
                else do
                  let headers = Express.reqHeaders input.req
                      explicit = Object.lookup "idempotency-key" headers
                      key = explicit >>= F.asString
                      invalid = case explicit, key of
                        Nothing, _ -> false
                        Just value, Nothing -> not (F.isNullish value)
                        _, Just value -> length value > 512
                  if invalid then pure (Xrpc.Failure 400 "Invalid Idempotency-Key.") else do
                    id <- deps.enqueue did track key ((Object.lookup "x-rocksky-mirror-provider" headers >>= F.asString) == Just "tealfm")
                    attribute "submission.id" id
                    pure (Util.json {})
      case result of
        Right output -> pure output
        Left e | isSubmissionUnavailable e -> pure (Xrpc.Failure 503 (message e))
        Left e -> do
          liftEffect (traverse_ (\s -> Trace.recordException s (F.toForeign e) *> Trace.setStatusError s) span)
          liftEffect (Log.error ("[createScrobble] unexpected error for " <> did <> ": " <> message e))
          pure (Xrpc.Failure 500 "Internal error while creating scrobble.")

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.scrobble.createScrobble"
  { auth: Just ctx.authVerifier
  , handler: handlerWith
      { guard: \did -> Guard.assertNotBotFlagged ctx did *> Guard.assertNotScrobbleBlocked ctx did
      , agentAvailable: map isJust <<< createAgent ctx
      , enqueue: enqueueSubmission { url: env."SUBMISSIONS_URL", secret: env."SUBMISSIONS_SECRET" }
      } }
