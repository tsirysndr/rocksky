-- | OAuth state and session stores over the SQLite database (`src/auth/storage.ts`).
module Rocksky.Auth.Storage (stateStore, sessionStore, retryOnBusy) where

import Prelude

import Atproto.OAuthClientNode (StoreImpl)
import Consola as Consola
import Data.Array (elem, index, length)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Rocksky.Db (Database)
import Rocksky.Db as Db
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Error (errorCode, errorToForeign)
import Rocksky.Lib.Foreign (parseJson, readStringAt)

-- SQLite reports "the file is locked right now" as an error, not as a wait,
-- so every call here has to treat it as retryable. `busy_timeout` handles most
-- of it, but two processes share `atproto.sqlite` and either can be mid-write
-- when the other arrives.
busyCodes :: Array String
busyCodes = [ "SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT", "SQLITE_LOCKED", "SQLITE_PROTOCOL" ]

-- | Retries a store operation while SQLite reports the file as busy.
-- |
-- | `@atproto/oauth-client` treats both failure modes as facts about the
-- | session rather than about the disk: a read that throws becomes "the
-- | session was deleted" and a 401, a write that throws revokes the refresh
-- | token at the PDS. Neither is recoverable, so a transient lock must never
-- | reach the SDK.
retryOnBusy :: forall a. String -> Aff a -> Aff a
retryOnBusy label op = go 0
  where
  delays = [ 10, 25, 50, 100, 250 ]
  go attemptNo = do
    r <- attempt op
    case r of
      Right a -> pure a
      Left err -> do
        let busy = fromMaybe false (map (_ `elem` busyCodes) (errorCode err))
        if not busy || attemptNo >= length delays then do
          when busy $ liftEffect $ Consola.errorF
            ("auth store " <> label <> " still locked after " <> show (length delays) <> " retries")
            [ errorToForeign err ]
          throwError err
        else do
          sleep (fromMaybe 250 (index delays attemptNo))
          go (attemptNo + 1)

stateStore :: Database -> StoreImpl
stateStore db =
  { get: \key -> retryOnBusy "state.get" (map _.state <$> Db.getAuthState db key)
  , set: \key state -> retryOnBusy "state.set" (Db.upsertAuthState db key state)
  , del: \key -> retryOnBusy "state.del" (Db.deleteAuthState db key)
  }

sessionStore :: Database -> StoreImpl
sessionStore db =
  { get: \key -> retryOnBusy "session.get" (map _.session <$> Db.getAuthSession db key)
  , set: \key session -> do
      let expiresAt = case parseJson session of
            Right v -> readStringAt "tokenSet.expires_at" v
            Left _ -> Nothing
      retryOnBusy "session.set" (Db.upsertAuthSession db key session (toNullable expiresAt))
  , del: \key -> retryOnBusy "session.del" (Db.deleteAuthSession db key)
  }
