-- | Builds an authenticated agent for a DID (`src/lib/agent.ts`): an app-password
-- | session stored under `atp:<did>` wins, otherwise the OAuth session is restored.
module Rocksky.Lib.Agent
  ( createAgent
  , pdsSessionExpired
  , PdsSessionExpired
  , isSessionRejected
  ) where

import Prelude

import Atproto.Api (Agent)
import Atproto.Api as Api
import Atproto.OAuthClientNode as OAuth
import Consola as Consola
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff, Error, attempt)
import Effect.Class (liftEffect)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Db as Db
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Error (describeError, errorName)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)

type PdsSessionExpired = { status :: String, error :: String, message :: String }

-- | Body for 401 responses when the user's OAuth session with their PDS is dead
-- | (refresh token expired or revoked). Their Rocksky JWT may still be valid, so
-- | clients must distinguish this from a bad token: stop retrying and prompt the
-- | user to log in again.
pdsSessionExpired :: PdsSessionExpired
pdsSessionExpired =
  { status: "unauthorized"
  , error: "pds_session_expired"
  , message: "Your session with your PDS has expired. Please log in to Rocksky again."
  }

-- | Whether the authorization server has actually rejected this session, as
-- | opposed to us merely failing to reach it. Dropping `auth_session` is
-- | irreversible from the server's side, so only a definite rejection may stop
-- | the retries; the SDK already deletes the stored session for these errors.
isSessionRejected :: Error -> Boolean
isSessionRejected e =
  OAuth.isTokenRefreshError e || OAuth.isTokenRevokedError e || OAuth.isTokenInvalidError e
    -- `restore()` deletes the stored session before throwing this one. Not
    -- exported by @atproto/oauth-client, hence the name check.
    || errorName e == "AuthMethodUnsatisfiableError"

-- | The app-password equivalent: `resumeSession` rejects both when the PDS
-- | refuses the stored credentials and when it could not be reached at all.
isAtpSessionRejected :: Error -> Boolean
isAtpSessionRejected e = case Api.xrpcErrorStatus e, Api.xrpcErrorName e of
  Just s, Just name | s == 400 || s == 401 -> name == "ExpiredToken" || name == "InvalidToken" || name == "AccountTakedown"
  _, _ -> false

data Step = Done (Maybe Agent) | Retry

createAgent :: Context -> String -> Aff (Maybe Agent)
createAgent ctx did = go 0
  where
  go retry
    | retry >= 5 = pure Nothing
    | otherwise = do
        r <- attempt attemptOnce
        case r of
          Right (Done a) -> pure a
          Right Retry -> sleep 1000 *> go (retry + 1)
          Left e -> do
            liftEffect do
              Consola.info "Error creating agent"
              Consola.info did
              Consola.info (describeError e)
            sleep 1000
            go (retry + 1)

  attemptOnce = do
    stored <- Db.getAuthSession ctx.sqliteDb ("atp:" <> did)
    case stored of
      Just row -> resumeAppPassword row.session
      Nothing -> restoreOAuth

  resumeAppPassword session = do
    cached <- Redis.get ctx.redis ("pds:" <> did)
    pds <- case cached of
      Just p -> pure p
      Nothing -> do
        p <- extractPdsFromDid did
        case p of
          Just url -> Redis.setEx ctx.redis ("pds:" <> did) (60 * 15) url $> url
          Nothing -> pure ""
    atpAgent <- liftEffect (Api.newAtpAgent pds)
    r <- attempt (Api.resumeSession atpAgent session)
    case r of
      Right _ -> pure (Done (Just atpAgent))
      Left e
        | isAtpSessionRejected e -> do
            liftEffect do
              Consola.info ("Stored app-password session for " <> did <> " was rejected by the PDS, removing it")
              Consola.info (describeError e)
            Db.deleteAuthSession ctx.sqliteDb ("atp:" <> did)
            pure (Done Nothing)
        -- Could not reach the PDS. Keep the session and retry: returning the
        -- agent here would hand back one with no session at all.
        | otherwise -> do
            liftEffect do
              Consola.warn ("Could not resume the session for " <> did <> ", retrying")
              Consola.warn (describeError e)
            pure Retry

  restoreOAuth = do
    r <- attempt (OAuth.restore ctx.oauthClient did)
    case r of
      Left e
        | isSessionRejected e -> do
            -- The refresh token was revoked or expired. The SDK has already
            -- dropped the stored session: the user has to sign in again.
            liftEffect do
              Consola.info ("Session for " <> did <> " is no longer valid")
              Consola.info (describeError e)
            pure (Done Nothing)
        -- Anything else is transient (lock contention, PDS unreachable, …).
        -- Retry, and above all leave `auth_session` alone: deleting it here is
        -- what silently logged users out mid-session.
        | otherwise -> do
            liftEffect do
              Consola.warn ("Could not restore the session for " <> did <> ", retrying")
              Consola.warn (describeError e)
            pure Retry
      Right Nothing -> pure Retry
      Right (Just session) -> do
        agent <- liftEffect (Api.newAgentFromSession session)
        pure (Done (Just agent))
