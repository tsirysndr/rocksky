-- | Bindings for `nats` (v2): connect, publish, subscribe and flush.
module Nats
  ( Connection
  , Subscription
  , Msg
  , connect
  , publish
  , publishString
  , subscribe
  , subscribePull
  , nextMessage
  , unsubscribe
  , flush
  , close
  , msgData
  , msgSubject
  , decodeString
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn3, mkEffectFn1, runEffectFn3)
import Node.Buffer (Buffer)

foreign import data Connection :: Type
foreign import data Subscription :: Type
foreign import data Msg :: Type

foreign import connectImpl :: String -> Effect (Promise Connection)

-- | `connect({ servers })`.
connect :: String -> Aff Connection
connect s = toAffE (connectImpl s)

foreign import publish :: Connection -> String -> Buffer -> Effect Unit

-- | Publish a string payload (utf-8).
foreign import publishString :: Connection -> String -> String -> Effect Unit

foreign import subscribeImpl :: EffectFn3 Connection String (EffectFn1 Msg Unit) Subscription

-- | `nc.subscribe(subject)` consumed as an async iterator; `f` runs for each
-- | message. Errors thrown by `f` are caught and logged, so one bad message
-- | never ends the subscription.
subscribe :: Connection -> String -> (Msg -> Effect Unit) -> Effect Subscription
subscribe c s f = runEffectFn3 subscribeImpl c s (mkEffectFn1 f)

foreign import flushImpl :: Connection -> Effect (Promise Unit)

flush :: Connection -> Aff Unit
flush c = toAffE (flushImpl c)

foreign import closeImpl :: Connection -> Effect (Promise Unit)

close :: Connection -> Aff Unit
close c = toAffE (closeImpl c)

foreign import msgData :: Msg -> Buffer
foreign import msgSubject :: Msg -> String

-- | `StringCodec().decode(msg.data)`.
foreign import decodeString :: Msg -> String

-- | A pull subscription for ordered stream consumers.
foreign import subscribePull :: Connection -> String -> Effect Subscription
foreign import nextMessageImpl :: Subscription -> Effect (Promise (Nullable Msg))

nextMessage :: Subscription -> Aff (Maybe Msg)
nextMessage subscription = toMaybe <$> toAffE (nextMessageImpl subscription)

foreign import unsubscribe :: Subscription -> Effect Unit
