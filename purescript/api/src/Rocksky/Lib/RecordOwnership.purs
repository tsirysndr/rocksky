-- | Whether a user already has their own copy of a catalogue record, and a
-- | short-lived claim that stops concurrent scrobbles from each publishing one.
-- |
-- | `user_artists` / `user_albums` / `user_tracks` rows are not always the
-- | user's own records: `publishScrobble` fills them with the global row's uri,
-- | and ingest only overwrites that once the user's own record comes through
-- | Jetstream. Only a uri under the user's DID proves there is a record in
-- | their repo to reuse.
module Rocksky.Lib.RecordOwnership
  ( ownsRecord
  , recordPutClaimTtlSeconds
  , claimRecordPut
  , releaseRecordPut
  , putRecordOnce
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), stripPrefix)
import Effect.Aff (Aff, attempt, throwError)
import Redis (Client)
import Redis as Redis

ownsRecord :: Nullable String -> String -> Boolean
ownsRecord uri did = case toMaybe uri of
  Just u -> isJust (stripPrefix (Pattern ("at://" <> did <> "/")) u)
  Nothing -> false

-- Postgres only learns about a put after Jetstream has indexed it, so the
-- ownership check cannot see a put that is still in flight. The claim is
-- scoped per identity hash and outlives ingest by a wide margin; it is
-- released again when the put fails so the next scrobble retries it.
recordPutClaimTtlSeconds :: Int
recordPutClaimTtlSeconds = 15 * 60

claimKey :: String -> String -> String -> String
claimKey did collection hash = "record-put:v1:" <> did <> ":" <> collection <> ":" <> hash

claimRecordPut :: Client -> String -> String -> String -> Aff Boolean
claimRecordPut redis did collection hash = Redis.setNX redis (claimKey did collection hash) "1" recordPutClaimTtlSeconds

releaseRecordPut :: Client -> String -> String -> String -> Aff Unit
releaseRecordPut redis did collection hash = void (Redis.del redis (claimKey did collection hash))

-- | Publish a record once per claim window. A rejected claim means another
-- | request is already publishing (or just published) the same record.
putRecordOnce :: Client -> String -> String -> String -> Aff (Maybe String) -> Aff (Maybe String)
putRecordOnce redis did collection hash put = do
  claimed <- claimRecordPut redis did collection hash
  if not claimed then pure Nothing
  else do
    r <- attempt put
    case r of
      Right (Just uri) -> pure (Just uri)
      Right Nothing -> releaseRecordPut redis did collection hash $> Nothing
      Left e -> releaseRecordPut redis did collection hash *> throwError e
