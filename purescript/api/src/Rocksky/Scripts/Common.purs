-- | Shared plumbing for the operational scripts (`src/scripts/*.ts`).
module Rocksky.Scripts.Common
  ( parseInt10
  , localeCompare
  , parseArgs
  , runScript
  , scriptArgs
  , exit
  , resolveDid
  , requireAgent
  , publishJson
  , envString
  , envNumber
  , envLimit
  , envFlag
  , nowMs
  , isoString
  , toFixed
  , padStart
  , padEnd
  , rkeyOf
  , listAllRecords
  , showNumber
  ) where

import Prelude

import Atproto.Api (Agent, RecordEntry)
import Atproto.Api as Api
import Atproto.Identity as Identity
import Data.Either (Either(..))
import Data.Int (toNumber)
import Data.Int as Int
import Data.JSDate (JSDate)
import Data.JSDate as JSDate
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, notNull, null, toMaybe)
import Data.Number (fromString, infinity, isFinite)
import Data.Number.Format (fixed, toStringWith)
import Data.String (Pattern(..), split)
import Data.String as String
import Data.String.CodeUnits (fromCharArray)
import Effect (Effect)
import Effect.Aff (Aff, error, runAff_, throwError)
import Effect.Class (liftEffect)
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Nats as Nats
import Node.Process (argv, exit', lookupEnv)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Error (logError)
import Rocksky.Lib.Foreign (stringify)
import Data.Array (last, replicate)
import Data.Array as Array

-- | Run a script body. A failure is logged and exits with status 1, which is
-- | what an unhandled top-level rejection (or `main().catch(...)`) did in TS.
runScript :: Aff Unit -> Effect Unit
runScript body = runAff_ handler body
  where
  handler = case _ of
    Left e -> logError e *> exit' 1
    Right _ -> pure unit

-- | `process.argv.slice(2)`.
scriptArgs :: Effect (Array String)
scriptArgs = Array.drop 2 <$> argv

exit :: forall a. Int -> Aff a
exit code = liftEffect (exit' code)

-- | `ctx.baseIdResolver.handle.resolve(handle)`.
resolveDid :: Context -> String -> Aff String
resolveDid ctx handle = do
  r <- Identity.resolveHandle ctx.baseIdResolver handle
  case r of
    Just did -> pure did
    Nothing -> throwError (error ("Could not resolve handle " <> handle))

-- | `createAgent(...)` where the TS used the result without a null check:
-- | a missing session fails the script rather than continuing without one.
requireAgent :: Context -> String -> Aff Agent
requireAgent ctx did = createAgent ctx did >>= case _ of
  Just a -> pure a
  Nothing -> throwError (error ("No usable PDS session for " <> did))

-- | `ctx.nc.publish(subject, Buffer.from(JSON.stringify(payload)))`.
publishJson :: Context -> String -> Foreign -> Effect Unit
publishJson ctx subject payload = Nats.publishString ctx.nc subject (stringify payload)

envString :: String -> Effect (Maybe String)
envString = lookupEnv

-- | `Number(process.env.X ?? fallback)`.
envNumber :: String -> Number -> Effect Number
envNumber name fallback = do
  v <- lookupEnv name
  pure case v of
    Nothing -> fallback
    Just s -> fromMaybe nan (fromString s)
  where
  nan = 0.0 / 0.0

-- | `process.env.X ? Number(process.env.X) : Number.POSITIVE_INFINITY`.
envLimit :: String -> Effect Number
envLimit name = do
  v <- lookupEnv name
  pure case v of
    Just s | s /= "" -> fromMaybe (0.0 / 0.0) (fromString s)
    _ -> infinity

-- | `process.env.X === value`.
envFlag :: String -> String -> Effect Boolean
envFlag name value = (_ == Just value) <$> lookupEnv name

nowMs :: Effect Number
nowMs = JSDate.getTime <$> JSDate.now

isoString :: JSDate -> String
isoString d = unsafePerformEffect (JSDate.toISOString d)

-- | `n.toFixed(digits)`.
toFixed :: Int -> Number -> String
toFixed digits = toStringWith (fixed digits)

-- | `String(n)` for a number that may be integral.
showNumber :: Number -> String
showNumber n
  | isFinite n, Just i <- Int.fromNumber n, toNumber i == n = show i
  | otherwise = show n

padStart :: Int -> String -> String
padStart width s = fromCharArray (replicate (width - String.length s) ' ') <> s

padEnd :: Int -> String -> String
padEnd width s = s <> fromCharArray (replicate (width - String.length s) ' ')

-- | `uri.split("/").pop()`.
rkeyOf :: String -> String
rkeyOf uri = fromMaybe "" (last (split (Pattern "/") uri))

-- | Page a collection to the end, `limit` records per request, calling
-- | `onPage` with the running total after each page.
listAllRecords :: Agent -> String -> String -> (Int -> Effect Unit) -> Aff (Array RecordEntry)
listAllRecords agent repo collection onPage = go [] null
  where
  go :: Array RecordEntry -> Nullable String -> Aff (Array RecordEntry)
  go acc cursor = do
    res <- Api.listRecords agent { repo, collection, limit: 100, cursor }
    let acc' = acc <> res.records
    liftEffect (onPage (Array.length acc'))
    maybe (pure acc') (\c -> go acc' (notNull c)) (toMaybe res.cursor)

-- node:util.parseArgs; configuration and validation stay in PureScript.
foreign import parseArgs :: Foreign -> Effect Foreign

foreign import localeCompare :: String -> String -> Int

foreign import parseInt10 :: String -> Number
