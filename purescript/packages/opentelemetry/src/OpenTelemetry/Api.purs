-- | Bindings for `@opentelemetry/api` (traces and metrics).
module OpenTelemetry.Api
  ( Span
  , Tracer
  , Meter
  , Counter
  , Histogram
  , Attributes
  , getActiveSpan
  , updateName
  , setAttribute
  , setAttributeNumber
  , setAttributes
  , addEvent
  , addEventWith
  , recordException
  , setStatusError
  , endSpan
  , getTracer
  , startServerSpanFromHeaders
  , withSpanActive
  , getMeter
  , createCounter
  , createHistogram
  , counterAdd
  , histogramRecord
  ) where

import Prelude

import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Uncurried (EffectFn2, EffectFn3, runEffectFn2, runEffectFn3)
import Foreign (Foreign)
import Foreign.Object (Object)

foreign import data Span :: Type
foreign import data Tracer :: Type
foreign import data Meter :: Type
foreign import data Counter :: Type
foreign import data Histogram :: Type

-- | String/number/boolean attribute values.
type Attributes = Object Foreign

foreign import getActiveSpanImpl :: Effect (Nullable Span)

-- | `trace.getActiveSpan()`.
getActiveSpan :: Effect (Maybe Span)
getActiveSpan = toMaybe <$> getActiveSpanImpl

foreign import updateName :: Span -> String -> Effect Unit
foreign import setAttribute :: Span -> String -> String -> Effect Unit
foreign import setAttributeNumber :: Span -> String -> Number -> Effect Unit
foreign import setAttributes :: Span -> Attributes -> Effect Unit
foreign import addEvent :: Span -> String -> Effect Unit
foreign import addEventWith :: Span -> String -> Attributes -> Effect Unit
foreign import recordException :: Span -> Foreign -> Effect Unit
foreign import setStatusError :: Span -> Effect Unit
foreign import endSpan :: Span -> Effect Unit

foreign import getTracer :: String -> Effect Tracer

foreign import startServerSpanFromHeadersImpl :: EffectFn3 Tracer String { attributes :: Attributes, headers :: Foreign } Span

-- | Start a SERVER span named `name`, parented to the active span when there
-- | is one and otherwise to the W3C `traceparent` found in `headers`.
startServerSpanFromHeaders :: Tracer -> String -> Attributes -> Foreign -> Effect Span
startServerSpanFromHeaders t n attrs headers = runEffectFn3 startServerSpanFromHeadersImpl t n { attributes: attrs, headers }

foreign import withSpanActiveImpl :: EffectFn2 Span (Effect Unit) Unit

-- | `context.with(trace.setSpan(context.active(), span), f)`.
withSpanActive :: Span -> Effect Unit -> Effect Unit
withSpanActive s f = runEffectFn2 withSpanActiveImpl s f

foreign import getMeter :: String -> Effect Meter

foreign import createCounter :: Meter -> String -> String -> Effect Counter
foreign import createHistogram :: Meter -> String -> String -> Effect Histogram

foreign import counterAdd :: Counter -> Number -> Attributes -> Effect Unit
foreign import histogramRecord :: Histogram -> Number -> Attributes -> Effect Unit
