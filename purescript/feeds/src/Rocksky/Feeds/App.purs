module Rocksky.Feeds.App where

import Prelude
import Atproto.Syntax (parseAtUri)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Hono as H
import Rocksky.Feeds.Algorithms as Algorithms
import Rocksky.Feeds.Auth as Auth
import Rocksky.Feeds.Query as Query
import Rocksky.Feeds.Telemetry as Telemetry
import Rocksky.Lib.Foreign as F

foreign import validFeedUri :: String -> Boolean

type Context =
  { domain :: String
  , version :: String
  , db :: Database Postgres
  , authenticate :: String -> Aff (Maybe String)
  }

failure :: H.Context -> Int -> String -> String -> Aff H.Response
failure c status code message = liftEffect $ H.jsonWith c (F.toForeign { error: code, message }) status

skeleton :: Context -> H.Handler
skeleton ctx c = case H.reqQuery c "feed" >>= (\value -> if validFeedUri value then parseAtUri value else Nothing) of
  Nothing -> failure c 400 "InvalidRequest" "Invalid or missing feed URI"
  Just uri -> case parsedLimit, parsedOffset of
    Just limit, Just _ | limit >= 1 ->
      case Algorithms.find uri.host uri.rkey of
        Just algo | uri.collection == Algorithms.collection -> do
          did <- ctx.authenticate (fromMaybe "" (H.reqHeader c "authorization"))
          if algo.needsAuth && not (isJust did) then do
            liftEffect $ Telemetry.count algo.rkey "unauthorized"
            failure c 401 "AuthRequired" "Authentication Required"
          else do
            let cursor = fromMaybe "" (H.reqQuery c "cursor")
            body <- Telemetry.measure algo.rkey Algorithms.publisherDid limit (cursor /= "") (isJust did) $
              Query.run ctx.db algo { limit, cursor }
            liftEffect $ H.json c body
        _ -> do
          liftEffect $ Telemetry.count "unknown" "unsupported_algorithm"
          failure c 400 "UnsupportedAlgorithm" "Unsupported algorithm"
    _, _ -> failure c 400 "InvalidRequest" "Invalid limit or offset"
  where
  parsedLimit = case H.reqQuery c "limit" of
    Nothing -> Just 50
    Just value -> Int.fromString value
  parsedOffset = case H.reqQuery c "offset" of
    Nothing -> Just 0
    Just value -> case Int.fromString value of
      Just offset | offset >= 0 -> Just offset
      _ -> Nothing

app :: Context -> Effect H.App
app ctx = do
  server <- H.new
  Telemetry.installHttp server
  H.onError server \_ c -> failure c 500 "InternalServerError" "Internal Server Error"
  H.get server "/" \c -> liftEffect $ H.text c "This is a Feed Generation service! Most endpoints are under /xrpc"
  H.get server "/xrpc/_health" \c -> liftEffect $ H.json c (F.toForeign { version: ctx.version })
  H.get server "/.well-known/did.json" \c -> liftEffect $ H.json c $ F.toForeign
    { "@context": [ "https://www.w3.org/ns/did/v1" ]
    , id: "did:web:" <> ctx.domain
    , service: [ { id: "#rocksky_fg", type: "RockskyFeedGenerator", serviceEndpoint: "https://" <> ctx.domain } ]
    }
  H.get server "/xrpc/app.rocksky.feed.describeFeedGenerator" \c -> liftEffect $ H.json c $ F.toForeign
    { did: "did:web:" <> ctx.domain
    , feeds: map (\algo -> { uri: Algorithms.uri algo }) Algorithms.algorithms
    }
  H.get server "/xrpc/app.rocksky.feed.getFeedSkeleton" (skeleton ctx)
  pure server

defaultAuth :: String -> Aff (Maybe String)
defaultAuth = Auth.optional
