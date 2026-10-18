module Rocksky.Scripts.Genres (main, getSpotifyToken, enrichArtists, synchronize) where

import Prelude
import Consola as Log
import Data.Array as A
import Data.Either (Either(..))
import Data.Int as Int
import Data.Maybe (Maybe, fromMaybe)
import Data.Nullable (notNull, toMaybe)
import Data.Traversable (for_)
import Drizzle.Builder (leftJoin, limit, offset, run, runUpdate, selectFieldsFrom, selectFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Effect.Random (random)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import JSURI (encodeURIComponent)
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Crypto (decrypt)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest (firstRow)
import Rocksky.Schema as T
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Scripts.Common (exit, runScript)

getSpotifyToken :: Context -> Aff String
getSpotifyToken ctx = do
  rows <- run ctx.db (selectFieldsFrom { token: tableSQL T.spotifyTokens, app: tableSQL T.spotifyApps } T.spotifyTokens
    # leftJoin T.spotifyAccounts (SQL.eq (toSQL T.spotifyAccountsC.userId) (toSQL T.spotifyTokensC.userId))
    # leftJoin T.spotifyApps (SQL.eq (toSQL T.spotifyAppsC.spotifyAppId) (toSQL T.spotifyTokensC.spotifyAppId))
    # where_ (SQL.eq (toSQL T.spotifyAccountsC.isBetaUser) (SQL.bool true))) :: Aff (Array { token :: { refreshToken :: String }, app :: { spotifyAppId :: String, spotifySecret :: String } })
  fraction <- liftEffect random
  row <- firstRow (A.take 1 (A.drop (Int.floor (fraction * Int.toNumber (A.length rows))) rows))
  refresh <- liftEffect (decrypt row.token.refreshToken env."SPOTIFY_ENCRYPTION_KEY")
  secret <- liftEffect (decrypt row.app.spotifySecret env."SPOTIFY_ENCRYPTION_KEY")
  response <- Fetch.fetchWith "https://accounts.spotify.com/api/token" (Fetch.defaultOptions
    { method = "POST", headers = Object.singleton "Content-Type" "application/x-www-form-urlencoded"
    , body = notNull (F.toForeign (Fetch.urlEncoded (Object.fromHomogeneous { grant_type: "refresh_token", refresh_token: refresh, client_id: row.app.spotifyAppId, client_secret: secret }))) }) >>= Fetch.json
  pure (F.stringValue (fromMaybe F.undefined (F.path "access_token" response)))

search :: Context -> SelectArtist -> Aff (Maybe Foreign)
search ctx artist = do
  token <- getSpotifyToken ctx
  let encoded = fromMaybe artist.name (encodeURIComponent artist.name)
  response <- Fetch.fetchWith (env."SPOTIFY_API_URL" <> "/search?q=" <> encoded <> "&type=artist&limit=1")
    (Fetch.defaultOptions { headers = Object.singleton "Authorization" ("Bearer " <> token) }) >>= Fetch.json
  pure (F.path "artists.items.0" response)

enrichArtists :: Context -> (SelectArtist -> Aff (Maybe Foreign)) -> Aff Unit -> Array SelectArtist -> Aff Unit
enrichArtists ctx lookup pause artists = for_ artists \artist -> do
  let attemptArtist = do
        result <- attempt do
          found <- lookup artist
          for_ found \value -> do
            liftEffect (Log.info (F.stringifyPretty value))
            let genres = fromMaybe [] (F.readArrayAt "genres" value)
            unless (A.null genres) (runUpdate ctx.db (updateForeign T.artists (F.toForeign { genres }) # where_ (SQL.eq (toSQL T.artistsC.id) (SQL.string artist.id))))
            when (fromMaybe "" (toMaybe artist.picture) == "" && not (A.null (fromMaybe [] (F.readArrayAt "images" value)))) do
              runUpdate ctx.db (updateForeign T.artists (F.toForeign { picture: fromMaybe F.undefined (F.path "images.0.url" value) }) # where_ (SQL.eq (toSQL T.artistsC.id) (SQL.string artist.id)))
        case result of
          Right _ -> pure unit
          Left e -> do
            liftEffect (Log.errorF ("Error fetching genres for artist: " <> artist.name) [errorToForeign e])
            pause
            attemptArtist
  attemptArtist
  pause

synchronize :: Context -> (SelectArtist -> Aff (Maybe Foreign)) -> Aff Unit -> Aff Unit
synchronize ctx lookup pause = do
  initial <- run ctx.db (selectFrom T.artists # where_ (SQL.isNull (toSQL T.artistsC.genres))) :: Aff (Array SelectArtist)
  let count = A.length initial
  -- Preserve source offset pagination over the shrinking NULL-genres set.
  let page at = when (at < count) do
        artists <- run ctx.db (selectFrom T.artists # where_ (SQL.isNull (toSQL T.artistsC.genres)) # offset at # limit 1000) :: Aff (Array SelectArtist)
        enrichArtists ctx lookup pause artists
        page (at + 1000)
  page 0
  liftEffect (Log.info ("Artists without genres: " <> show count))

main :: Effect Unit
main = runScript do
  ctx <- createContext
  synchronize ctx (search ctx) (sleep 1000)
  exit 0
