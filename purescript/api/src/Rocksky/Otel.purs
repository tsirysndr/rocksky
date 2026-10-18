-- | Telemetry bootstrap (`src/otel.ts`). Call `start` first thing in `main`,
-- | before anything that should be auto-instrumented.
module Rocksky.Otel (start) where

import Prelude

import Consola as Consola
import Control.Alt ((<|>))
import Data.Array (index, tail)
import Data.Nullable (toNullable)
import Effect.Class (liftEffect)
import Data.Either (hush)
import Data.Int (floor)
import Data.JSDate (getTime, now)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), contains, joinWith, take)
import Data.String.Regex (regex, replace)
import Data.String.Regex.Flags (global, ignoreCase)
import Effect (Effect)
import Effect.Aff (launchAff_)
import Foreign (tagOf)
import Foreign.Object as Object
import Node.Path (basename)
import Node.Process (argv, lookupEnv, pid)
import OpenTelemetry.Sdk as Sdk
import Rocksky.Lib.Error (describeError, foreignToError)
import Rocksky.Lib.Foreign (asString, stringify, toForeign)
import Rocksky.Lib.Version (version)

foreign import killSelf :: String -> Effect Unit
foreign import onceSignal :: String -> Effect Unit -> Effect Unit

stripTrailingSlashes :: String -> String
stripTrailingSlashes s = case hush (regex "/+$" global) of
  Just re -> replace re "" s
  Nothing -> s

-- | Telemetry must never carry credentials or PII: bearer tokens, JWT-shaped
-- | strings and query strings are stripped from every log line.
redactText :: String -> String
redactText s0 = foldRegex
  [ { re: "bearer\\s+[\\w\\-.~+/=]+", flags: true, to: "Bearer [REDACTED]" }
  , { re: "eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+", flags: false, to: "[REDACTED]" }
  , { re: "(https?://[^\\s\"'?]+)\\?[^\\s\"']*", flags: false, to: "$1" }
  ]
  where
  foldRegex rules = go rules s0
  go [] s = s
  go rules s = case index rules 0 of
    Nothing -> s
    Just r ->
      let
        next = case hush (regex r.re (if r.flags then global <> ignoreCase else global)) of
          Just re -> replace re r.to s
          Nothing -> s
      in
        go (fromMaybe [] (tail rules)) next

-- consola level → OTel severity number
severity :: Int -> Int
severity = case _ of
  0 -> 17 -- ERROR
  1 -> 13 -- WARN
  2 -> 9 -- INFO
  3 -> 9
  4 -> 5 -- DEBUG
  5 -> 1 -- TRACE
  _ -> 9

start :: Effect Unit
start = do
  base <- map (stripTrailingSlashes <<< fromMaybe "http://127.0.0.1:4318") (lookupEnv "OTEL_EXPORTER_OTLP_ENDPOINT")
  tracesUrl <- fromMaybe (base <> "/v1/traces") <$> lookupEnv "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"
  metricsUrl <- fromMaybe (base <> "/v1/metrics") <$> lookupEnv "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"
  logsUrl <- fromMaybe (base <> "/v1/logs") <$> lookupEnv "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"
  -- Index (Hono) and Server (XRPC) run as separate processes from the same
  -- codebase; tell them apart by entrypoint unless explicitly named.
  args <- argv
  let entrypoint = basename (fromMaybe "" (index args 2 <|> index args 1))
  named <- lookupEnv "OTEL_SERVICE_NAME"
  let serviceName = fromMaybe (if contains (Pattern "Server") entrypoint || take 6 entrypoint == "server" then "rocksky-xrpc" else "rocksky-api") named
  deployment <- lookupEnv "DEPLOYMENT_ENVIRONMENT"
  t <- getTime <$> now
  sdk <- Sdk.start
    { serviceName
    , serviceVersion: version
    -- Every Rocksky process shares a namespace, which lets a backend show
    -- "all of Rocksky" without naming the services by hand.
    , serviceNamespace: "rocksky"
    -- Tells the two processes apart across a restart: pid and start time.
    , instanceId: show pid <> "-" <> show (floor t)
    , deploymentEnvironment: toNullable deployment
    , tracesUrl
    , metricsUrl
    , logsUrl
    , metricExportIntervalMillis: 10000
    , sensitiveKeyPattern: "authorization|cookie|set-cookie|token|secret|passw|api[-_]?key|session"
    -- fs/net/dns produce enormous span volume for no diagnostic value here
    , disabledInstrumentations:
        [ "@opentelemetry/instrumentation-fs", "@opentelemetry/instrumentation-net", "@opentelemetry/instrumentation-dns" ]
    }
  -- Bridge consola to OTel logs so every existing consola call ships to the
  -- collector, correlated with the active span.
  logger <- Sdk.getLogger serviceName
  Consola.addReporter \logObj -> do
    let
      render arg = case asString arg of
        Just s -> s
        Nothing -> if tagOf arg == "Error" then describeError (foreignToError arg) else stringify arg
      body = joinWith " " (map render logObj.args)
    Sdk.emitLog logger
      { severityNumber: severity logObj.level
      , severityText: logObj.type
      , body: redactText body
      , attributes: if logObj.tag /= "" then Object.singleton "log.tag" (toForeign logObj.tag) else Object.empty
      }
  let flushAndExit signal = launchAff_ do
        Sdk.shutdown sdk
        liftEffect (killSelf signal)
  onceSignal "SIGTERM" (flushAndExit "SIGTERM")
  onceSignal "SIGINT" (flushAndExit "SIGINT")
