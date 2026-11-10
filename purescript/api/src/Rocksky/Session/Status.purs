module Rocksky.Session.Status (check) where

import Prelude
import Effect.Aff (Aff)

-- | Recheck storage after restore so transient failures never sign users out.
check :: Aff Boolean -> Aff Boolean -> Aff Int
check hasSession restore = do
  exists <- hasSession
  if not exists then pure 401
  else do
    restored <- restore
    if restored then pure 200
    else do
      stillExists <- hasSession
      pure (if stillExists then 503 else 401)
