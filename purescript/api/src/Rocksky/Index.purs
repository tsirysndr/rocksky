module Rocksky.Index (main, app) where

import Prelude
import Data.Maybe (Maybe(..))
import Data.Traversable (for_)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Effect.Now (now)
import Data.DateTime.Instant (unInstant)
import Data.Newtype (unwrap)
import Hono as Hono
import Hono.Cors as Cors
import Hono.NodeServer as NodeServer
import OpenTelemetry.Api as OtelApi
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Process (setDnsIpv4First)
import Rocksky.Metrics as Metrics
import Rocksky.Otel as Otel
import Rocksky.Profiling as Profiling
import Rocksky.Ratelimiter (rateLimiter)
import Rocksky.Rest.Reads as Reads
import Rocksky.Rest.Mutations as Mutations
import Rocksky.Subscribers.Index (subscribe)
import Rocksky.Submissions.App as Submissions
import Rocksky.Bsky.App as Bsky
import Rocksky.Spotify.App as Spotify
import Rocksky.Storage.App as Storage
import Rocksky.Apikeys.App as Apikeys
import Rocksky.AccessTokens.App as AccessTokens
import Rocksky.Notifications.Sse as Notifications
import Rocksky.Opengraph.App as Opengraph
import Rocksky.Uploads.App as Uploads
import Rocksky.Users.App as Users
import Rocksky.Webscrobbler.App as Webscrobbler

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  -- Internal workers have their own concurrency/auth path before public middleware.
  Submissions.app ctx >>= Hono.route a "/internal/submissions"
  Hono.use a (rateLimiter ctx { limit: 1000, window: 30, keyPrefix: "ratelimit" })
  Hono.use a \c next -> do
    liftEffect do
      span <- OtelApi.getActiveSpan
      for_ span \s -> do
        OtelApi.updateName s (Hono.reqMethod c <> " " <> Hono.reqPath c)
        OtelApi.setAttribute s "http.route" (Hono.reqPath c)
    next
    pure Nothing
  Hono.use a \c next -> do
    start <- liftEffect now
    next
    end <- liftEffect now
    liftEffect (OtelApi.histogramRecord ctx.metrics.requestDuration ((unwrap (unInstant end) - unwrap (unInstant start)) / 1000.0)
      (Metrics.labels [Tuple "route" (Hono.reqPath c), Tuple "method" (Hono.reqMethod c)]))
    pure Nothing
  Cors.cors a
  Bsky.app ctx >>= Hono.route a "/"
  Spotify.app ctx >>= Hono.route a "/spotify"
  Storage.app ctx >>= Hono.route a "/storage"
  Apikeys.app ctx >>= Hono.route a "/apikeys"
  AccessTokens.app ctx >>= Hono.route a "/access-tokens"
  Notifications.app ctx >>= Hono.route a "/notifications"
  Opengraph.app ctx >>= Hono.route a "/public/og"
  Reads.register ctx a
  Mutations.register ctx a
  Uploads.app ctx >>= Hono.route a "/uploads"
  Users.app ctx >>= Hono.route a "/users"
  Webscrobbler.app ctx >>= Hono.route a "/webscrobbler"
  pure a

main :: Effect Unit
main = do
  Otel.start
  Profiling.start
  setDnsIpv4First
  launchAff_ do
    ctx <- createContext
    liftEffect do
      subscribe ctx
      a <- app ctx
      void (NodeServer.serve a 8000)
