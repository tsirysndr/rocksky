-- | Thin proxy layer for the `app.rocksky.library.*` XRPC methods.
-- |
-- | Each method authenticates the caller via the usual Rocksky JWT (→ DID),
-- | resolves the DID to the user's handle, then forwards the request to the
-- | internal navidrome (Subsonic-compat) service, trusting it via the shared
-- | `X-Rocksky-Internal` secret so navidrome skips its own credential check.
-- | navidrome stays the single source of truth.
module Rocksky.Lib.Navidrome
  ( NavidromeError
  , navidromeError
  , navidromeHttpStatus
  , UnknownUserError
  , unknownUserError
  , LibraryError(..)
  , classifyError
  , resolveHandle
  , callNavidrome
  , callNavidromeForUrl
  , libraryErrorResponse
  , ProxyOptions
  , defaultProxyOptions
  , proxyMethod
  , proxyHandler
  ) where

import Prelude

import Atproto.XrpcServer (HandlerInput, HandlerOutput(..), MethodConfig)
import Data.Array (head)
import Data.Either (Either(..))
import Data.Int (fromString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, Error, attempt, message, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object (Object)
import Foreign.Object as Object
import JSURI (encodeURIComponent)
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Error (errorField, errorName, logErrorWith)
import Rocksky.Lib.Foreign (asObject, isNullish, path, readIntAt, readStringAt, stringify, toForeign, asString)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (authDid, inputBody)

-- | A Subsonic-style error surfaced by navidrome (`subsonic-response.error`).
type NavidromeError = { code :: Int, message :: String }

-- | Raised when a JWT-authenticated DID has no matching Rocksky user row.
type UnknownUserError = { did :: String }

foreign import mkNavidromeError :: Int -> String -> Error
foreign import mkUnknownUserError :: String -> String -> Error

navidromeError :: Int -> String -> Error
navidromeError = mkNavidromeError

unknownUserError :: String -> Error
unknownUserError did = mkUnknownUserError did ("No user found for DID " <> did)

-- | Map Subsonic error codes to the closest HTTP status for the XRPC reply.
navidromeHttpStatus :: Int -> Int
navidromeHttpStatus = case _ of
  10 -> 400 -- missing required parameter
  40 -> 401 -- wrong username or password
  41 -> 401 -- token auth not supported
  50 -> 403 -- user not authorized for the operation
  70 -> 404 -- requested data not found
  _ -> 500

data LibraryError
  = Navidrome NavidromeError
  | UnknownUser UnknownUserError
  | Other Error

classifyError :: Error -> LibraryError
classifyError e = case errorName e of
  "NavidromeError" -> Navidrome { code: fromMaybe 0 (errorField e "code" >>= fromString), message: message e }
  "UnknownUserError" -> UnknownUser { did: fromMaybe "" (errorField e "did") }
  _ -> Other e

resolveHandle :: Context -> String -> Aff String
resolveHandle ctx did = do
  rows :: Array { handle :: String } <- run ctx.db
    ( selectFieldsFrom { handle: toSQL T.usersC.handle } T.users
        # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did))
        # limit 1
    )
  case head rows of
    Just r -> pure r.handle
    Nothing -> throwError (unknownUserError did)

-- | Build the Subsonic query string from the XRPC params, injecting the
-- | resolved user handle as `u` and forcing JSON. Null params are dropped;
-- | any client-supplied `u` is overwritten.
buildQuery :: Foreign -> String -> String
buildQuery params handle =
  let
    base = fromMaybe Object.empty (asObject params)
    withAuth = Object.insert "f" "json" (Object.insert "u" handle (Object.mapWithKey (\_ v -> render v) (Object.filter (not <<< isNullish) base)))
    pairs = (Object.toUnfoldable withAuth :: Array (Tuple String String))
  in
    joinWith "&" (map (\(Tuple k v) -> enc k <> "=" <> enc v) pairs)
  where
  enc s = fromMaybe s (encodeURIComponent s)
  render v = case asString v of
    Just s -> s
    Nothing -> stringify v

navidromeUrl :: String -> String -> String
navidromeUrl method qs = env."NAVIDROME_INTERNAL_URL" <> "/rest/" <> method <> "?" <> qs

internalHeaders :: Object String
internalHeaders = Object.singleton "X-Rocksky-Internal" env."NAVIDROME_INTERNAL_SECRET"

subsonicPayload :: Fetch.Response -> Aff (Maybe Foreign)
subsonicPayload res = do
  json <- attempt (Fetch.json res)
  pure case json of
    Right j -> path "subsonic-response" j
    Left _ -> Nothing

failedError :: Foreign -> Maybe Error
failedError payload =
  if readStringAt "status" payload == Just "failed" then
    Just (navidromeError (fromMaybe 0 (readIntAt "error.code" payload)) (fromMaybe "Navidrome error" (readStringAt "error.message" payload)))
  else Nothing

-- | Call a navidrome JSON method and return the unwrapped `subsonic-response`
-- | payload. Throws a NavidromeError when navidrome reports `status: "failed"`.
callNavidrome :: Context -> String -> String -> Foreign -> Aff Foreign
callNavidrome ctx method did params = do
  handle <- resolveHandle ctx did
  res <- Fetch.fetchWith (navidromeUrl method (buildQuery params handle)) Fetch.defaultOptions { headers = internalHeaders }
  payload <- subsonicPayload res
  case payload of
    Nothing -> throwError (navidromeError 0 ("Malformed navidrome response for " <> method))
    Just p -> case failedError p of
      Just e -> throwError e
      Nothing -> pure p

-- | Call a navidrome method that responds with a redirect to a media/art URL
-- | (`stream`, `download`, `getCoverArt`) and return that URL. navidrome never
-- | proxies bytes; it redirects to a CDN or presigned S3 URL.
callNavidromeForUrl :: Context -> String -> String -> Foreign -> Aff String
callNavidromeForUrl ctx method did params = do
  handle <- resolveHandle ctx did
  res <- Fetch.fetchWith (navidromeUrl method (buildQuery params handle)) Fetch.defaultOptions { headers = internalHeaders, redirect = "manual" }
  case Fetch.header res "location" of
    Just location | location /= "" -> pure location
    _ -> do
      -- No redirect: navidrome likely returned a Subsonic error envelope.
      payload <- subsonicPayload res
      case payload >>= failedError of
        Just e -> throwError e
        Nothing -> throwError (navidromeError 0 ("No redirect URL returned for " <> method))

-- | An XRPC error reply for anything a library handler can fail with.
libraryErrorResponse :: String -> Error -> Aff HandlerOutput
libraryErrorResponse method err = case classifyError err of
  Navidrome e -> pure (Failure (navidromeHttpStatus e.code) e.message)
  UnknownUser _ -> pure (Failure 401 (message err))
  Other e -> do
    liftEffect (logErrorWith ("[library." <> method <> "]") e)
    pure (Failure 500 ("Internal error in library." <> method))

type ProxyOptions =
  { -- | Read params from the request body (procedures) instead of query params.
    source :: String
  -- | This method returns a media/art URL rather than a JSON payload.
  , url :: Boolean
  }

defaultProxyOptions :: ProxyOptions
defaultProxyOptions = { source: "params", url: false }

-- | The handler for a library method that simply proxies to navidrome.
proxyHandler :: Context -> String -> ProxyOptions -> HandlerInput -> Aff HandlerOutput
proxyHandler ctx method options input = case authDid input of
  Nothing -> pure (Failure 400 "Missing authenticated DID.")
  Just did -> do
    let params = if options.source == "input" then fromMaybe (toForeign {}) (inputBody input) else input.params
    r <- attempt
      if options.url then (\location -> Json (toForeign { url: location })) <$> callNavidromeForUrl ctx method did params
      else Json <$> callNavidrome ctx method did params
    case r of
      Right out -> pure out
      Left err -> libraryErrorResponse method err

-- | The method config (`{ auth, handler }`) for a pure navidrome proxy.
proxyMethod :: Context -> String -> ProxyOptions -> MethodConfig
proxyMethod ctx method options = { auth: Just ctx.authVerifier, handler: proxyHandler ctx method options }
