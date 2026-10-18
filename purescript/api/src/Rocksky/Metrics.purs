-- | OpenTelemetry instruments (`src/metrics.ts`). Create them after
-- | `Rocksky.Otel.start`, or they bind to the no-op MeterProvider.
module Rocksky.Metrics (Metrics, create, count, labels) where

import Prelude

import Data.Tuple (Tuple(..))
import Effect (Effect)
import Foreign.Object as Object
import OpenTelemetry.Api (Attributes, Counter, Histogram, counterAdd, createCounter, createHistogram, getMeter)
import Rocksky.Lib.Foreign (toForeign)

type Metrics =
  { requestCounter :: Counter
  , requestDuration :: Histogram
  , xrpcRequestCounter :: Counter
  , xrpcRequestDuration :: Histogram
  }

create :: Effect Metrics
create = do
  meter <- getMeter "rocksky-api"
  requestCounter <- createCounter meter "http_requests_total" "Count of incoming requests"
  requestDuration <- createHistogram meter "http_request_duration_seconds" "Request duration in seconds"
  xrpcRequestCounter <- createCounter meter "xrpc_requests_total" "Count of XRPC requests, by NSID and status code"
  xrpcRequestDuration <- createHistogram meter "xrpc_request_duration_seconds" "XRPC request duration in seconds, by NSID"
  pure { requestCounter, requestDuration, xrpcRequestCounter, xrpcRequestDuration }

-- | `{ method, route }` labels.
labels :: Array (Tuple String String) -> Attributes
labels kvs = Object.fromFoldable (map (\(Tuple k v) -> Tuple k (toForeign v)) kvs)

-- | `requestCounter.add(1, { method, route })`.
count :: Metrics -> String -> String -> Effect Unit
count m method route = counterAdd m.requestCounter 1.0 (labels [ Tuple "method" method, Tuple "route" route ])
