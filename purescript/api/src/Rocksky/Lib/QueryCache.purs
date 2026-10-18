-- | A TTL cache in front of a lookup (`src/lib/queryCache.ts`): concurrent
-- | lookups for the same key share one in-flight computation, failures are
-- | never retained, and entries expire after `ttlMs`. Allocate once when
-- | registering a handler; re-creating it per request defeats it.
module Rocksky.Lib.QueryCache (queryCache, QueryCache) where

import Prelude

import Data.Array (drop)
import Data.Int (toNumber)
import Data.JSDate (getTime, now)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Either (Either(..))
import Effect (Effect)
import Effect.AVar (AVar)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Aff.AVar as AVar
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Rocksky.Lib.Foreign (stringify, toForeign)

type Entry a = { value :: a, expiresAt :: Number }

type QueryCache p a = p -> Aff a

-- | `queryCache lookup ttlMs capacity`. Keys are the JSON encoding of the
-- | params record, so structurally equal params hit the same entry.
queryCache :: forall p a. (p -> Aff a) -> Int -> Int -> Effect (QueryCache p a)
queryCache lookup ttlMs capacity = do
  entries <- Ref.new (Map.empty :: Map.Map String (Entry a))
  inflight <- Ref.new (Map.empty :: Map.Map String (AVar (Either String a)))
  pure \p -> do
    let key = stringify (toForeign p)
    t <- liftEffect (getTime <$> now)
    cached <- liftEffect (Map.lookup key <$> Ref.read entries)
    case cached of
      Just e | e.expiresAt > t -> pure e.value
      _ -> do
        pending <- liftEffect (Map.lookup key <$> Ref.read inflight)
        case pending of
          Just av -> do
            r <- AVar.read av
            case r of
              Right a -> pure a
              Left _ -> lookup p
          Nothing -> do
            av <- AVar.empty
            liftEffect (Ref.modify_ (Map.insert key av) inflight)
            result <- attempt (lookup p)
            liftEffect (Ref.modify_ (Map.delete key) inflight)
            case result of
              Right a -> do
                liftEffect $ Ref.modify_ (\m -> Map.insert key { value: a, expiresAt: t + toNumber ttlMs } (evict m)) entries
                AVar.put (Right a) av
                pure a
              Left e -> do
                AVar.put (Left "failed") av
                throwError e
  where
  -- Drop the oldest entries when over capacity.
  evict m =
    if Map.size m >= capacity then Map.fromFoldable (drop (Map.size m - capacity + 1) (Map.toUnfoldable m :: Array _))
    else m
