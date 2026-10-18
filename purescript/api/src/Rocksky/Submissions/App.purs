module Rocksky.Submissions.App (app) where

import Prelude
import Atproto.Lexicon as Lexicon
import Data.Either (Either(..), isRight)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (toMaybe)
import Data.Number as Number
import Data.String (Pattern(..), stripPrefix)
import Effect (Effect)
import Effect.Aff (attempt)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent, pdsSessionExpired)
import Rocksky.Lib.DurableSubmission (submissionRecordKey, validSubmissionSecret)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (path, readBooleanAt, readStringAt, toForeign, undefined)
import Rocksky.Lib.Matching (matches)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.ScrobbleGuard (ScrobbleGuardError(..), fromError)
import Rocksky.Nowplaying.Service (scrobbleTrack)
import Rocksky.Tealfm.Publication (publishTealRecord)
import Rocksky.Tealfm.PushEnabled (isTealPushEnabled)
import Rocksky.Types.Track (parseTrack)

submissionIdentity :: Foreign -> Maybe { did :: String, submissionId :: String }
submissionIdentity body = do
  did <- readStringAt "did" body
  submissionId <- readStringAt "submissionId" body
  if isJust (stripPrefix (Pattern "did:") did) && matches "^[a-f0-9]{64}$" submissionId
    then Just { did, submissionId }
    else Nothing

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.post a "/tealfm/process" \c ->
    if not (authorized c) then failure c 401 "Unauthorized"
    else do
      body <- Hono.reqJson c
      let record = fromMaybe undefined (path "track" body)
      validDate <- case readStringAt "playedTime" record of
        Nothing -> pure false
        Just timestamp -> liftEffect (Number.isFinite <<< Date.getTime <$> Date.parse timestamp)
      case submissionIdentity body of
        Just input | isRight (Lexicon.validateRecord ctx.lexicons "fm.teal.feed.play" record) && validDate ->
          case submissionRecordKey (fromMaybe undefined (path "recordKey" body)) of
            Left _ -> failure c 400 "Invalid stored record key"
            Right rkey -> do
              result <- attempt do
                enabled <- isTealPushEnabled ctx input.did
                if not enabled then success c input.submissionId
                else do
                  maybeAgent <- createAgent ctx input.did
                  case maybeAgent of
                    Nothing -> Rest.json c 401 (toForeign pdsSessionExpired)
                    Just agent -> do
                      publishTealRecord agent record rkey Nothing
                      success c input.submissionId
              case result of
                Left _ -> failure c 503 "Teal publication failed"
                Right response -> pure response
        _ -> failure c 400 "Invalid Teal submission"
  Hono.post a "/process" \c ->
    if not (authorized c) then failure c 401 "Unauthorized"
    else do
      body <- Hono.reqJson c
      case submissionIdentity body of
        Nothing -> failure c 400 "Invalid submission"
        Just input -> case parseTrack (fromMaybe undefined (path "track" body)) of
          Right track | fromMaybe 0.0 (toMaybe track.timestamp) /= 0.0 ->
            case submissionRecordKey (fromMaybe undefined (path "recordKey" body)) of
              Left _ -> failure c 400 "Invalid stored record key"
              Right rkey -> do
                maybeAgent <- createAgent ctx input.did
                case maybeAgent of
                  Nothing -> Rest.json c 401 (toForeign pdsSessionExpired)
                  Just agent -> do
                    result <- attempt (scrobbleTrack ctx track agent input.did false Nothing (Just { id: input.submissionId, rkey, skipTeal: readBooleanAt "skipTeal" body == Just true }))
                    case result of
                      Right _ -> success c input.submissionId
                      Left e -> case fromError e of
                        Just (ScrobbleBotFlagged _) -> failure c 403 "Account flagged as bot"
                        Just (ScrobbleBlocked blocked) -> do
                          liftEffect (Hono.setHeader c "Retry-After" (show blocked.retryAfter))
                          failure c 429 "Scrobble temporarily blocked"
                        Nothing -> failure c 503 "Publication failed"
          _ -> failure c 400 "Invalid stored track"
  pure a
  where
  authorized c = validSubmissionSecret (Hono.reqHeader c "x-rocksky-submissions-secret") env."SUBMISSIONS_SECRET"
  failure c status error = Rest.json c status (toForeign { error })
  success c submissionId = Rest.json c 200 (toForeign { status: "published", submissionId })
