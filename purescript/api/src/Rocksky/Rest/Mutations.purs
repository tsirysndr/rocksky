module Rocksky.Rest.Mutations (register, registerWith, Operations) where

import Prelude
import Atproto.Api (Agent)
import Consola as Log
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains, length)
import Effect (Effect)
import Effect.Aff (Aff, attempt, message, throwError)
import Effect.Class (liftEffect)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent, pdsSessionExpired)
import Rocksky.Lib.DurableSubmission as Submission
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.ScrobbleGuard as Guard
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Lovedtracks.Service as Loved
import Rocksky.Rest.Common as Common
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Tracks.Service (saveTrack)
import Rocksky.Types.Track (Track, parseTrack)

type Operations =
  { agent :: String -> Aff (Maybe Agent)
  , guard :: String -> Aff Unit
  , enqueue :: String -> Track -> Maybe String -> Aff String
  , save :: Track -> Agent -> Aff Unit
  , like :: Track -> SelectUser -> Agent -> Aff Unit
  , unlike :: String -> SelectUser -> Agent -> Aff Unit }

register :: Context -> Hono.App -> Effect Unit
register ctx = registerWith ctx
  { agent: createAgent ctx
  , guard: \did -> Guard.assertNotBotFlagged ctx did *> Guard.assertNotScrobbleBlocked ctx did
  , enqueue: \did track key -> Submission.enqueueSubmission { url: env."SUBMISSIONS_URL", secret: env."SUBMISSIONS_SECRET" } did track key false
  , save: saveTrack ctx
  , like: \track user agent -> void (Loved.likeTrack ctx track user agent)
  , unlike: Loved.unLikeTrack ctx }

registerWith :: Context -> Operations -> Hono.App -> Effect Unit
registerWith ctx ops app = do
  let agentFor c did action = ops.agent did >>= case _ of
        Nothing -> do
          liftEffect (Log.warn ("No PDS agent for " <> did <> ", returning 401"))
          Rest.json c 401 (F.toForeign pdsSessionExpired)
        Just agent -> action agent
  let parse c action = do
        body <- Hono.reqJson c
        case parseTrack body of
          Left errors -> Rest.text c 400 ("Invalid track data: " <> formatZodLike errors)
          Right track -> action track
  let ok c = Rest.json c 200 (F.toForeign { status: "ok" })
  Common.route ctx app "POST" "/now-playing" \c -> Common.withDid ctx c \did -> Common.withUser ctx c did \user -> parse c \track -> agentFor c did \_ -> do
    result <- attempt do
      ops.guard user.did
      let key = Hono.reqHeader c "idempotency-key"
      case key of
        Just k | length k > 512 -> Rest.json c 400 (F.toForeign { error: "Invalid Idempotency-Key" })
        _ -> do
          id <- ops.enqueue user.did track key
          liftEffect (Hono.setHeader c "X-Submission-Id" id)
          ok c
    case result of
      Right response -> pure response
      Left err | Submission.isSubmissionUnavailable err -> Rest.json c 503 (F.toForeign { error: message err })
      Left err -> case Guard.fromError err of
        Just (Guard.ScrobbleBotFlagged _) -> do
          liftEffect (Log.warn ("[now-playing] rejected bot-flagged account " <> did))
          Rest.json c 429 (F.toForeign { status: "blocked", error: "account_flagged_as_bot", message: Guard.scrobbleBotFlaggedMessage })
        Just (Guard.ScrobbleBlocked { retryAfter }) -> do
          liftEffect do
            Log.warn ("[now-playing] blocked suspected bot " <> did <> " — retry after " <> show retryAfter <> "s")
            Hono.setHeader c "Retry-After" (show retryAfter)
          Rest.json c 429 (F.toForeign { status: "blocked", error: "scrobble_rate_exceeded", message: Guard.scrobbleBlockedMessage retryAfter, retryAfter })
        Nothing -> throwError err
  Common.route ctx app "POST" "/likes" \c -> Common.withDid ctx c \did -> agentFor c did \agent -> Common.withUser ctx c did \user -> parse c \track -> do
    ops.like track user agent
    ok c
  Common.route ctx app "DELETE" "/likes/:sha256" \c -> Common.withDid ctx c \did -> agentFor c did \agent -> Common.withUser ctx c did \user -> do
    ops.unlike (Hono.reqParam c "sha256") user agent
    ok c
  Common.route ctx app "POST" "/tracks" \c -> Common.withDid ctx c \did -> Common.withUser ctx c did \_ -> parse c \track -> agentFor c did \agent -> do
    result <- attempt (ops.save track agent)
    case result of
      Left err | not (contains (Pattern "duplicate key value violates unique constraint") (message err)) -> liftEffect (Log.error ("[tracks] " <> message err))
      _ -> pure unit
    ok c
