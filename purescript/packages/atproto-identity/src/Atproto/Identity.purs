-- | Bindings for `@atproto/identity`: `IdResolver` with a pluggable DID
-- | document cache.
module Atproto.Identity
  ( IdResolver
  , DidCache
  , DidCacheImpl
  , CacheResult
  , mkDidCache
  , createIdResolver
  , resolveHandle
  , resolveAtprotoData
  , AtprotoData
  , ensureResolve
  , resolveDidDocument
  ) where

import Prelude

import Control.Promise (Promise, fromAff, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn2, mkEffectFn2)
import Foreign (Foreign)

foreign import data IdResolver :: Type
foreign import data DidCache :: Type

type CacheResult = { did :: String, doc :: Foreign, updatedAt :: Number, stale :: Boolean, expired :: Boolean }

-- | The `DidCache` interface. `refreshCache` receives the DID and a thunk
-- | that fetches a fresh document (`Nothing` when it no longer resolves).
type DidCacheImpl =
  { cacheDid :: String -> Foreign -> Aff Unit
  , checkCache :: String -> Aff (Maybe CacheResult)
  , refreshCache :: String -> Aff (Maybe Foreign) -> Aff Unit
  , clearEntry :: String -> Aff Unit
  , clear :: Aff Unit
  }

type RawCache =
  { cacheDid :: EffectFn2 String Foreign (Promise Unit)
  , checkCache :: String -> Effect (Promise (Nullable CacheResult))
  , refreshCache :: EffectFn2 String (Effect (Promise (Nullable Foreign))) (Promise Unit)
  , clearEntry :: String -> Effect (Promise Unit)
  , clear :: Effect (Promise Unit)
  }

foreign import mkDidCacheImpl :: RawCache -> DidCache

mkDidCache :: DidCacheImpl -> DidCache
mkDidCache c = mkDidCacheImpl
  { cacheDid: mkEffectFn2 \d doc -> fromAff (c.cacheDid d doc)
  , checkCache: \d -> fromAff (toNullable <$> c.checkCache d)
  , refreshCache: mkEffectFn2 \d getDoc -> fromAff (c.refreshCache d (toMaybe <$> toAffE getDoc))
  , clearEntry: \d -> fromAff (c.clearEntry d)
  , clear: fromAff c.clear
  }

-- | `new IdResolver({ plcUrl, didCache })`.
foreign import createIdResolver :: String -> DidCache -> Effect IdResolver

foreign import resolveHandleImpl :: IdResolver -> String -> Effect (Promise (Nullable String))

-- | `resolver.handle.resolve(handle)` → DID.
resolveHandle :: IdResolver -> String -> Aff (Maybe String)
resolveHandle r h = toMaybe <$> toAffE (resolveHandleImpl r h)

type AtprotoData = { did :: String, handle :: String, pds :: String, signingKey :: String }

foreign import resolveAtprotoDataImpl :: IdResolver -> String -> Effect (Promise AtprotoData)

-- | `resolver.did.resolveAtprotoData(did)`.
resolveAtprotoData :: IdResolver -> String -> Aff AtprotoData
resolveAtprotoData r d = toAffE (resolveAtprotoDataImpl r d)

foreign import ensureResolveImpl :: IdResolver -> String -> Boolean -> Effect (Promise Foreign)

-- | `resolver.did.ensureResolve(did, forceRefresh)`.
ensureResolve :: IdResolver -> String -> Boolean -> Aff Foreign
ensureResolve r d f = toAffE (ensureResolveImpl r d f)

foreign import resolveDidDocumentImpl :: IdResolver -> String -> Effect (Promise (Nullable Foreign))

resolveDidDocument :: IdResolver -> String -> Aff (Maybe Foreign)
resolveDidDocument r d = toMaybe <$> toAffE (resolveDidDocumentImpl r d)
