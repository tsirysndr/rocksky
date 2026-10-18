-- | Bindings for `@atproto/api`: `AtpAgent` (service URL or app password)
-- | and `Agent` (OAuth session), with the `com.atproto.repo.*` calls the API
-- | uses and `app.bsky.actor.getProfile`.
module Atproto.Api
  ( Agent
  , newAtpAgent
  , newAgentFromSession
  , OAuthSession
  , assertDid
  , did
  , sessionJson
  , resumeSession
  , login
  , getPreferences
  , resolveHandle
  , getBskyProfile
  , BskyProfile
  , putRecord
  , PutRecordInput
  , createRecord
  , CreateRecordInput
  , getRecord
  , GetRecordOutput
  , deleteRecord
  , listRecords
  , ListRecordsOutput
  , RecordEntry
  , uploadBlob
  , applyWrites
  , RecordRef
  , xrpcErrorName
  , xrpcErrorStatus
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Exception (Error)
import Foreign (Foreign)
import Node.Buffer (Buffer)

-- | An `Agent` or `AtpAgent`; both share the same request surface.
foreign import data Agent :: Type

-- | An OAuth session restored by `@atproto/oauth-client-node`.
foreign import data OAuthSession :: Type

-- | `new AtpAgent({ service })`.
foreign import newAtpAgent :: String -> Effect Agent

-- | `new Agent(session)`.
foreign import newAgentFromSession :: OAuthSession -> Effect Agent

-- | `agent.assertDid`: throws when the agent has no session.
foreign import assertDid :: Agent -> Effect String

foreign import didImpl :: Agent -> Nullable String

did :: Agent -> Maybe String
did = toMaybe <<< didImpl

-- | `JSON.stringify(agent.session)` for an app-password agent.
foreign import sessionJson :: Agent -> Effect String

foreign import resumeSessionImpl :: Agent -> String -> Effect (Promise Unit)

-- | `agent.resumeSession(JSON.parse(json))`.
resumeSession :: Agent -> String -> Aff Unit
resumeSession a s = toAffE (resumeSessionImpl a s)

foreign import loginImpl :: Agent -> String -> String -> Effect (Promise Unit)

login :: Agent -> { identifier :: String, password :: String } -> Aff Unit
login a c = toAffE (loginImpl a c.identifier c.password)

foreign import getPreferencesImpl :: Agent -> Effect (Promise Foreign)

getPreferences :: Agent -> Aff Foreign
getPreferences a = toAffE (getPreferencesImpl a)

foreign import resolveHandleImpl :: Agent -> String -> Effect (Promise String)

-- | `agent.resolveHandle({ handle })` → DID.
resolveHandle :: Agent -> String -> Aff String
resolveHandle a h = toAffE (resolveHandleImpl a h)

type BskyProfile =
  { did :: String
  , handle :: String
  , displayName :: Nullable String
  , avatar :: Nullable String
  , description :: Nullable String
  }

foreign import getBskyProfileImpl :: Agent -> String -> Effect (Promise BskyProfile)

-- | `agent.app.bsky.actor.getProfile({ actor })`.
getBskyProfile :: Agent -> String -> Aff BskyProfile
getBskyProfile a actor = toAffE (getBskyProfileImpl a actor)

type RecordRef = { uri :: String, cid :: String }

type PutRecordInput =
  { repo :: String
  , collection :: String
  , rkey :: String
  , record :: Foreign
  , validate :: Boolean
  -- | `Nothing` omits the field; `Just Nothing` sends `swapRecord: null`
  -- | (create-only); `Just (Just cid)` is a compare-and-swap.
  , swapRecord :: Maybe (Maybe String)
  }

foreign import putRecordImpl :: Agent -> Foreign -> Effect (Promise RecordRef)

putRecord :: Agent -> PutRecordInput -> Aff RecordRef
putRecord a i = toAffE (putRecordImpl a (encodePutRecord i))

foreign import encodePutRecord :: PutRecordInput -> Foreign

type CreateRecordInput =
  { repo :: String
  , collection :: String
  , rkey :: Nullable String
  , record :: Foreign
  , validate :: Boolean
  }

foreign import createRecordImpl :: Agent -> CreateRecordInput -> Effect (Promise RecordRef)

createRecord :: Agent -> CreateRecordInput -> Aff RecordRef
createRecord a i = toAffE (createRecordImpl a i)

type GetRecordOutput = { uri :: String, cid :: Nullable String, value :: Foreign }

foreign import getRecordImpl :: Agent -> String -> String -> String -> Effect (Promise GetRecordOutput)

-- | `agent.com.atproto.repo.getRecord({ repo, collection, rkey })`.
getRecord :: Agent -> { repo :: String, collection :: String, rkey :: String } -> Aff GetRecordOutput
getRecord a i = toAffE (getRecordImpl a i.repo i.collection i.rkey)

foreign import deleteRecordImpl :: Agent -> String -> String -> String -> Effect (Promise Unit)

deleteRecord :: Agent -> { repo :: String, collection :: String, rkey :: String } -> Aff Unit
deleteRecord a i = toAffE (deleteRecordImpl a i.repo i.collection i.rkey)

type RecordEntry = { uri :: String, cid :: String, value :: Foreign }

type ListRecordsOutput = { records :: Array RecordEntry, cursor :: Nullable String }

foreign import listRecordsImpl :: Agent -> String -> String -> Int -> Nullable String -> Effect (Promise ListRecordsOutput)

listRecords :: Agent -> { repo :: String, collection :: String, limit :: Int, cursor :: Nullable String } -> Aff ListRecordsOutput
listRecords a i = toAffE (listRecordsImpl a i.repo i.collection i.limit i.cursor)

foreign import uploadBlobImpl :: Agent -> Buffer -> String -> Effect (Promise Foreign)

-- | `agent.com.atproto.repo.uploadBlob(bytes, { encoding })` → the blob ref.
uploadBlob :: Agent -> Buffer -> String -> Aff Foreign
uploadBlob a b enc = toAffE (uploadBlobImpl a b enc)

foreign import applyWritesImpl :: Agent -> String -> Array Foreign -> Effect (Promise Unit)

-- | `agent.com.atproto.repo.applyWrites({ repo, writes })`.
applyWrites :: Agent -> String -> Array Foreign -> Aff Unit
applyWrites a repo ws = toAffE (applyWritesImpl a repo ws)

foreign import xrpcErrorNameImpl :: Error -> Nullable String

-- | The `error` field of an XRPC failure (e.g. "RecordNotFound").
xrpcErrorName :: Error -> Maybe String
xrpcErrorName = toMaybe <<< xrpcErrorNameImpl

foreign import xrpcErrorStatusImpl :: Error -> Nullable Int

xrpcErrorStatus :: Error -> Maybe Int
xrpcErrorStatus = toMaybe <<< xrpcErrorStatusImpl
