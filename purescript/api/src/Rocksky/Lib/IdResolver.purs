module Rocksky.Lib.IdResolver
  ( createIdResolver
  , BidirectionalResolver
  , createBidirectionalResolver
  ) where

import Prelude

import Atproto.Identity (IdResolver)
import Atproto.Identity as Identity
import Data.Array (zip)
import Data.Either (either)
import Data.Map (Map)
import Data.Map as Map
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Rocksky.Lib.Aff (forkAndForget)
import Rocksky.Lib.DidUnstorageCache (storageCache)
import Rocksky.Lib.Plc (plcDirectoryUrl)
import Unstorage (Storage)

hour :: Number
hour = 60.0e3 * 60.0

day :: Number
day = hour * 24.0

week :: Number
week = hour * 7.0

createIdResolver :: Storage -> Effect IdResolver
createIdResolver kv = Identity.createIdResolver plcDirectoryUrl
  (storageCache { store: kv, prefix: "didCache:", staleTTL: day, maxTTL: week })

type BidirectionalResolver =
  { resolveDidToHandle :: String -> Aff String
  , resolveDidsToHandles :: Array String -> Aff (Map String String)
  }

createBidirectionalResolver :: IdResolver -> BidirectionalResolver
createBidirectionalResolver resolver =
  { resolveDidToHandle
  , resolveDidsToHandles: \dids -> do
      handles <- traverse (\did -> either (const did) identity <$> attempt (resolveDidToHandle did)) dids
      pure (Map.fromFoldable (zip dids handles))
  }
  where
  resolveDidToHandle did = do
    didDoc <- Identity.resolveAtprotoData resolver did
    -- asynchronously double check that the handle resolves back
    forkAndForget do
      resolved <- Identity.resolveHandle resolver didDoc.handle
      when (resolved /= pure did) $ void (Identity.ensureResolve resolver did true)
    pure (if didDoc.handle == "" then did else didDoc.handle)
