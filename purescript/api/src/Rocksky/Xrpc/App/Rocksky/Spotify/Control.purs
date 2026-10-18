module Rocksky.Xrpc.App.Rocksky.Spotify.Control (control) where

import Prelude
import Consola as Log
import Data.Maybe (Maybe, fromMaybe)
import Drizzle.Builder (leftJoin, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (readStringAt)
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Schema as T
import Rocksky.Schema.SpotifyApps (SelectSpotifyApp)
import Rocksky.Schema.SpotifyTokens (SelectSpotifyToken)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Spotify.Playback (refreshAccess)

control :: Context -> Maybe String -> String -> String -> Aff Unit
control ctx did action suffix = do
  users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string (fromMaybe "" did))))
  user <- firstRow users
  rows :: Array { token :: SelectSpotifyToken, app :: SelectSpotifyApp } <- run ctx.db
    (selectFieldsFrom { token: tableSQL T.spotifyTokens, app: tableSQL T.spotifyApps } T.spotifyTokens
      # leftJoin T.spotifyApps (SQL.eq (toSQL T.spotifyTokensC.spotifyAppId) (toSQL T.spotifyAppsC.spotifyAppId))
      # where_ (SQL.eq (toSQL T.spotifyTokensC.userId) (SQL.string user.id)))
  row <- firstRow rows
  response <- refreshAccess row >>= Fetch.json
  let access = fromMaybe "undefined" (readStringAt "access_token" response)
  result <- Fetch.fetchWith (env."SPOTIFY_API_URL" <> "/me/player/" <> action <> suffix) Fetch.defaultOptions
    { method = if action == "next" || action == "previous" then "POST" else "PUT"
    , headers = Object.singleton "Authorization" ("Bearer " <> access) }
  liftEffect (Log.info (action <> " action result: " <> show (Fetch.status result)))
