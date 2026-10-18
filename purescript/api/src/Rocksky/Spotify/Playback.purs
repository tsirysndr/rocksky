module Rocksky.Spotify.Playback (register, refreshAccess) where

import Prelude
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable as Nullable
import Data.Number as Number
import Data.Number.Format as Format
import Data.Traversable (for_)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (leftJoin, limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign.Object as Object
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.Crypto (decrypt)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (readBooleanAt, readNumberAt, readStringAt, toForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Rsql (numberValue)
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.SpotifyApps (SelectSpotifyApp)
import Rocksky.Schema.SpotifyTokens (SelectSpotifyToken)
import Rocksky.Spotify.OAuth (formRequest)

type Token = { token :: SelectSpotifyToken, app :: SelectSpotifyApp }

refreshAccess :: Token -> Aff Fetch.Response
refreshAccess row = do
  refresh <- liftEffect (decrypt row.token.refreshToken env."SPOTIFY_ENCRYPTION_KEY")
  secret <- liftEffect (decrypt row.app.spotifySecret env."SPOTIFY_ENCRYPTION_KEY")
  formRequest [Tuple "grant_type" "refresh_token", Tuple "refresh_token" refresh, Tuple "client_id" row.app.spotifyAppId, Tuple "client_secret" secret]

withToken :: Context -> Hono.Context -> (Token -> Aff Hono.Response) -> Aff Hono.Response
withToken ctx c action = Rest.withUser ctx c \user -> do
  rows :: Array Token <- run ctx.db
    (selectFieldsFrom { token: tableSQL T.spotifyTokens, app: tableSQL T.spotifyApps } T.spotifyTokens
      # leftJoin T.spotifyApps (SQL.eq (toSQL T.spotifyTokensC.spotifyAppId) (toSQL T.spotifyAppsC.spotifyAppId))
      # where_ (SQL.eq (toSQL T.spotifyTokensC.userId) (SQL.string user.id)) # limit 1)
  case head rows of
    Nothing -> Rest.text c 401 "Unauthorized"
    Just row -> action row

register :: Context -> Hono.App -> Effect Unit
register ctx app = do
  for_ [{ path: "/pause", method: "PUT" }, { path: "/play", method: "PUT" }, { path: "/next", method: "POST" }, { path: "/previous", method: "POST" }, { path: "/seek", method: "PUT" }] \route ->
    (if route.method == "PUT" then Hono.put else Hono.post) app route.path \c -> do
      liftEffect (Metrics.count ctx.metrics route.method ("/spotify" <> route.path))
      withToken ctx c \row -> do
        token <- refreshAccess row >>= Fetch.json
        let access = fromMaybe "undefined" (readStringAt "access_token" token)
            suffix = if route.path == "/seek" then "?position_ms=" <> fromMaybe "undefined" (Hono.reqQuery c "position_ms") else ""
        response <- Fetch.fetchWith (env."SPOTIFY_API_URL" <> "/me/player" <> route.path <> suffix) Fetch.defaultOptions
          { method = route.method, headers = Object.singleton "Authorization" ("Bearer " <> access) }
        if Fetch.status response == 403 then Fetch.text response >>= Rest.text c 403
        else Fetch.json response >>= Rest.json c 200
  let volume c = do
        let method = Hono.reqMethod c
            value = fromMaybe Number.nan (Hono.reqQuery c "volume_percent" >>= numberValue)
        liftEffect (Metrics.count ctx.metrics method "/spotify/volume")
        if method == "PUT" && (not (Number.isFinite value) || Number.floor value /= value || value < 0.0 || value > 100.0)
          then Rest.json c 400 (toForeign { error: "Volume must be an integer from 0 to 100" })
          else withToken ctx c \row -> do
            authorization <- refreshAccess row
            if not (Fetch.ok authorization) then unauthorized c else do
              body <- Fetch.json authorization
              case readStringAt "access_token" body of
                Just access | access /= "" -> do
                  let url = env."SPOTIFY_API_URL" <> "/me/player" <> if method == "GET" then "" else "/volume?volume_percent=" <> Format.toString value
                  response <- Fetch.fetchWith url Fetch.defaultOptions { method = method, headers = Object.singleton "Authorization" ("Bearer " <> access) }
                  if not (Fetch.ok response) then do
                    body_ <- Fetch.text response
                    liftEffect (Hono.body c (toForeign body_) (Fetch.status response) (Object.singleton "Content-Type" (case Fetch.header response "Content-Type" of
                      Just value_ | value_ /= "" -> value_
                      _ -> "text/plain")))
                  else if method == "PUT" then liftEffect (Hono.body c (toForeign (Nullable.null :: Nullable.Nullable String)) 204 Object.empty)
                  else if Fetch.status response == 204 then Rest.json c 200 (toForeign { volume: nullForeign, supported: false })
                  else do
                    playback <- Fetch.json response
                    Rest.json c 200 (toForeign
                      { volume: fromMaybe nullForeign (toForeign <$> readNumberAt "device.volume_percent" playback)
                      , supported: readBooleanAt "device.supports_volume" playback == Just true && readBooleanAt "device.is_restricted" playback /= Just true })
                _ -> unauthorized c
  Hono.get app "/volume" volume
  Hono.put app "/volume" volume
  where
  unauthorized c = Rest.json c 401 (toForeign { error: "Spotify authorization failed" })
  nullForeign = toForeign (Nullable.null :: Nullable.Nullable String)
