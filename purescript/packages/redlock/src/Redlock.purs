-- | Bindings for `redlock` (v5 beta) over ioredis clients.
module Redlock (Redlock, Lock, create, acquire, release, withLock) where

import Prelude

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff, bracket)
import IORedis (Redis)

foreign import data Redlock :: Type
foreign import data Lock :: Type

-- | `new Redlock(clients)`.
foreign import create :: Array Redis -> Effect Redlock

foreign import acquireImpl :: Redlock -> Array String -> Int -> Effect (Promise Lock)

-- | `redlock.acquire(resources, durationMs)`.
acquire :: Redlock -> Array String -> Int -> Aff Lock
acquire r ks ms = toAffE (acquireImpl r ks ms)

foreign import releaseImpl :: Lock -> Effect (Promise Unit)

release :: Lock -> Aff Unit
release l = toAffE (releaseImpl l)

-- | Acquire, run, release (also on failure).
withLock :: forall a. Redlock -> Array String -> Int -> Aff a -> Aff a
withLock r ks ms act = bracket (acquire r ks ms) release (const act)
