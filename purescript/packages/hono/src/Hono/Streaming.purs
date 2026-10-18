-- | `hono/streaming`: server-sent events.
module Hono.Streaming
  ( SSEStream
  , streamSSE
  , writeSSE
  , sleep
  , onAbort
  , isAborted
  , SSEMessage
  ) where

import Prelude

import Control.Promise (Promise, fromAff, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn2, mkEffectFn1, runEffectFn2)
import Hono (Context, Response)

foreign import data SSEStream :: Type

type SSEMessage = { data :: String, event :: Nullable String, id :: Nullable String }

foreign import streamSSEImpl :: EffectFn2 Context (EffectFn1 SSEStream (Promise Unit)) Response

-- | `streamSSE(c, async stream => ...)`. The callback runs until it returns;
-- | keep it alive with `sleep` loops.
streamSSE :: Context -> (SSEStream -> Aff Unit) -> Effect Response
streamSSE c f = runEffectFn2 streamSSEImpl c (mkEffectFn1 \s -> fromAff (f s))

foreign import writeSSEImpl :: SSEStream -> SSEMessage -> Effect (Promise Unit)

writeSSE :: SSEStream -> SSEMessage -> Aff Unit
writeSSE s m = toAffE (writeSSEImpl s m)

foreign import sleepImpl :: SSEStream -> Int -> Effect (Promise Unit)

sleep :: SSEStream -> Int -> Aff Unit
sleep s ms = toAffE (sleepImpl s ms)

foreign import onAbortImpl :: EffectFn2 SSEStream (Effect Unit) Unit

onAbort :: SSEStream -> Effect Unit -> Effect Unit
onAbort s f = runEffectFn2 onAbortImpl s f

foreign import isAborted :: SSEStream -> Effect Boolean
