-- | One SERVER span per XRPC call, named by NSID (`src/lib/xrpcTelemetry.ts`).
-- | Only the path and status code are recorded; never headers, query params
-- | or request bodies.
module Rocksky.Lib.XrpcTelemetry (xrpcTelemetry) where

import Prelude

import Data.Int (toNumber)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), stripPrefix)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Now (now)
import Data.DateTime.Instant (unInstant)
import Data.Newtype (unwrap)
import Express (Middleware)
import Express as Express
import Foreign.Object as Object
import OpenTelemetry.Api as Otel
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Metrics (Metrics)

xrpcTelemetry :: Metrics -> Effect Middleware
xrpcTelemetry metrics = do
  tracer <- Otel.getTracer "rocksky-xrpc"
  pure \req res next -> case stripPrefix (Pattern "/xrpc/") (Express.reqPath req) of
    Nothing -> next
    Just rest -> do
      let
        nsid = if rest == "" then "unknown" else rest
        method = Express.reqMethod req
      startedAt <- unwrap <<< unInstant <$> now
      -- If http auto-instrumentation already opened a server span, nest under
      -- it; otherwise pick up the caller's traceparent ourselves.
      span <- Otel.startServerSpanFromHeaders tracer nsid
        (Object.fromFoldable [ Tuple "xrpc.method" (toForeign nsid), Tuple "http.request.method" (toForeign method), Tuple "url.path" (toForeign (Express.reqPath req)) ])
        (toForeign (Express.reqHeaders req))
      Express.onFinish res do
        finished <- unwrap <<< unInstant <$> now
        status <- Express.resStatusCode res
        let seconds = (finished - startedAt) / 1000.0
        Otel.setAttributeNumber span "http.response.status_code" (toNumber status)
        when (status >= 500) (Otel.setStatusError span)
        Otel.endSpan span
        let labels = Object.fromFoldable [ Tuple "nsid" (toForeign nsid), Tuple "method" (toForeign method), Tuple "status" (toForeign status) ]
        Otel.counterAdd metrics.xrpcRequestCounter 1.0 labels
        Otel.histogramRecord metrics.xrpcRequestDuration seconds labels
      Otel.withSpanActive span next
