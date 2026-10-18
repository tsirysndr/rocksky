-- | Bindings for the OpenTelemetry Node SDK: one call wires OTLP exporters
-- | for traces (with attribute scrubbing), metrics and logs, plus the Node
-- | auto-instrumentations, and starts the SDK.
module OpenTelemetry.Sdk
  ( Sdk
  , Config
  , start
  , shutdown
  , emitLog
  , LogRecord
  , Logger
  , getLogger
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Foreign.Object (Object)

foreign import data Sdk :: Type
foreign import data Logger :: Type

type Config =
  { serviceName :: String
  , serviceVersion :: String
  , serviceNamespace :: String
  , instanceId :: String
  , deploymentEnvironment :: Nullable String
  , tracesUrl :: String
  , metricsUrl :: String
  , logsUrl :: String
  , metricExportIntervalMillis :: Int
  -- | Attribute keys matching this regex are redacted on every span.
  , sensitiveKeyPattern :: String
  -- | Instrumentations to disable, e.g. `@opentelemetry/instrumentation-fs`.
  , disabledInstrumentations :: Array String
  }

-- | Build and `start()` the `NodeSDK`.
foreign import start :: Config -> Effect Sdk

foreign import shutdownImpl :: Sdk -> Effect (Promise Unit)

shutdown :: Sdk -> Aff Unit
shutdown s = toAffE (shutdownImpl s)

foreign import getLogger :: String -> Effect Logger

type LogRecord = { severityNumber :: Int, severityText :: String, body :: String, attributes :: Object Foreign }

-- | `logger.emit(record)`.
foreign import emitLog :: Logger -> LogRecord -> Effect Unit
