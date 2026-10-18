-- | An unstorage based DidCache with staleness and max TTL (`src/lib/didUnstorageCache.ts`).
module Rocksky.Lib.DidUnstorageCache (storageCache) where

import Prelude

import Atproto.Identity (DidCache, mkDidCache)
import Data.Either (Either(..))
import Data.JSDate (getTime, now)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Traversable (traverse)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Lib.Foreign (parseJson, path, readNumberAt, stringify, toForeign)
import Unstorage (Storage)
import Unstorage as Unstorage

storageCache :: { store :: Storage, prefix :: String, staleTTL :: Number, maxTTL :: Number } -> DidCache
storageCache { store, prefix, staleTTL, maxTTL } = mkDidCache
  { cacheDid
  , checkCache: \did -> do
      raw <- Unstorage.getItem store (prefix <> did)
      case raw >>= \s -> either' (parseJson s) of
        Nothing -> pure Nothing
        Just val -> do
          t <- liftEffect (getTime <$> now)
          let
            updatedAt = fromMaybe 0.0 (readNumberAt "updatedAt" val)
            doc = fromMaybe (toForeign unit) (path "doc" val)
          pure $ Just
            { did
            , doc
            , updatedAt
            , stale: t > updatedAt + staleTTL
            , expired: t > updatedAt + maxTTL
            }
  , refreshCache: \did getDoc -> do
      doc <- getDoc
      case doc of
        Just d -> cacheDid did d
        Nothing -> pure unit
  , clearEntry: \did -> Unstorage.removeItem store (prefix <> did)
  , clear: do
      keys <- Unstorage.getKeys store prefix
      void (traverse (Unstorage.removeItem store) keys)
  }
  where
  cacheDid did (doc :: Foreign) = do
    t <- liftEffect (getTime <$> now)
    Unstorage.setItem store (prefix <> did) (stringify (toForeign { doc, updatedAt: t }))
  either' = case _ of
    Right v -> Just v
    Left _ -> Nothing
