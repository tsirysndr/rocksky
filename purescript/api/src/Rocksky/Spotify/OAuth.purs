module Rocksky.Spotify.OAuth (register, formRequest, tokenUrl) where

import Prelude
import Consola as Log
import Data.Array (head)
import Data.Either (Either(..))
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe)
import Data.String (Pattern(..), contains, joinWith)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, having, insertForeign, leftJoin, limit, run, runInsert, runUpdate, selectFieldsFrom, selectFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Fetch as Fetch
import Foreign.Object as Object
import Hono as Hono
import Nats as Nats
import Node.Crypto (randomBytesHex)
import Rocksky.Context (Context)
import Rocksky.Lib.Crypto (encrypt, decrypt)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (readStringAt, stringify, toForeign, undefined)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.SpotifyAccounts (SelectSpotifyAccount)
import Rocksky.Schema.SpotifyApps (SelectSpotifyApp)
import Rocksky.Schema.SpotifyTokens (SelectSpotifyToken)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Types.Email (parseEmail)

tokenUrl :: String
tokenUrl = "https://accounts.spotify.com/api/token"

formRequest :: Array (Tuple String String) -> Aff Fetch.Response
formRequest fields = Fetch.fetchWith tokenUrl Fetch.defaultOptions
  { method = "POST", headers = Object.singleton "Content-Type" "application/x-www-form-urlencoded"
  , body = notNull (toForeign (Fetch.urlEncoded (Object.fromFoldable fields))) }

type Account = { account :: SelectSpotifyAccount, app :: Nullable SelectSpotifyApp }

register :: Context -> Hono.App -> Effect Unit
register ctx app = do
  Hono.get app "/login" \c -> do
    liftEffect (Metrics.count ctx.metrics "GET" "/spotify/login")
    Rest.withUser ctx c \user -> do
      rows :: Array Account <- run ctx.db
        (selectFieldsFrom { account: tableSQL T.spotifyAccounts, app: tableSQL T.spotifyApps } T.spotifyAccounts
          # leftJoin T.users (SQL.eq (toSQL T.spotifyAccountsC.userId) (toSQL T.usersC.id))
          # leftJoin T.spotifyApps (SQL.eq (toSQL T.spotifyAccountsC.spotifyAppId) (toSQL T.spotifyAppsC.spotifyAppId))
          # where_ (SQL.and (SQL.eq (toSQL T.spotifyAccountsC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.spotifyAccountsC.isBetaUser) (SQL.bool true))) # limit 1)
      state <- liftEffect (randomBytesHex 16)
      liftEffect (Ref.modify_ (Map.insert state user.did) ctx.kv)
      let clientId = fromMaybe "undefined" (_.spotifyAppId <$> (head rows >>= toMaybe <<< _.app))
          scopes = ["user-read-private", "user-read-email", "user-read-playback-state", "user-read-currently-playing", "user-modify-playback-state", "playlist-modify-public", "playlist-modify-private", "playlist-read-private", "playlist-read-collaborative"]
          redirectUrl = "https://accounts.spotify.com/en/authorize?client_id=" <> clientId <> "&response_type=code&redirect_uri=" <> env."SPOTIFY_REDIRECT_URI" <> "&scope=" <> joinWith "%20" scopes <> "&state=" <> state
      liftEffect (Hono.setHeader c "Set-Cookie" ("session-id=" <> state <> "; Path=/; HttpOnly; SameSite=Strict; Secure"))
      Rest.json c 200 (toForeign { redirectUrl })
  Hono.get app "/callback" \c -> do
    liftEffect (Metrics.count ctx.metrics "GET" "/spotify/callback")
    let redirect = liftEffect (Hono.redirect c env."FRONTEND_URL" 302)
    case Hono.reqQuery c "state" of
      Just state | state /= "" -> do
        storedDid <- liftEffect (Map.lookup state <$> Ref.read ctx.kv)
        case storedDid of
          Just did | did /= "" -> do
            liftEffect (Ref.modify_ (Map.delete state) ctx.kv)
            users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
            case head users of
              Nothing -> redirect
              Just user -> do
                rows :: Array Account <- run ctx.db
                  (selectFieldsFrom { account: tableSQL T.spotifyAccounts, app: tableSQL T.spotifyApps } T.spotifyAccounts
                    # leftJoin T.spotifyApps (SQL.eq (toSQL T.spotifyAccountsC.spotifyAppId) (toSQL T.spotifyAppsC.spotifyAppId))
                    # where_ (SQL.and (SQL.eq (toSQL T.spotifyAccountsC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.spotifyAccountsC.isBetaUser) (SQL.bool true))) # limit 1)
                row <- Rest.firstRow rows
                config <- case toMaybe row.app of
                  Nothing -> throwError (error "Spotify app missing")
                  Just app_ -> pure app_
                let appId = case toMaybe row.account.spotifyAppId of
                      Just value | value /= "" -> value
                      _ -> env."SPOTIFY_CLIENT_ID"
                    secret = if config.spotifySecret == "" then env."SPOTIFY_CLIENT_SECRET" else config.spotifySecret
                decrypted <- liftEffect (decrypt secret env."SPOTIFY_ENCRYPTION_KEY")
                body <- formRequest [Tuple "grant_type" "authorization_code", Tuple "code" (fromMaybe "undefined" (Hono.reqQuery c "code")), Tuple "redirect_uri" env."SPOTIFY_REDIRECT_URI", Tuple "client_id" appId, Tuple "client_secret" decrypted] >>= Fetch.json
                access <- case readStringAt "access_token" body of
                  Nothing -> throwError (error "Missing access token")
                  Just value -> liftEffect (encrypt value env."SPOTIFY_ENCRYPTION_KEY")
                refresh <- case readStringAt "refresh_token" body of
                  Nothing -> throwError (error "Missing refresh token")
                  Just value -> liftEffect (encrypt value env."SPOTIFY_ENCRYPTION_KEY")
                tokens :: Array SelectSpotifyToken <- run ctx.db (selectFrom T.spotifyTokens # where_ (SQL.eq (toSQL T.spotifyTokensC.userId) (SQL.string user.id)) # limit 1)
                case head tokens of
                  Just token -> runUpdate ctx.db (update T.spotifyTokens { accessToken: access, refreshToken: refresh } # where_ (SQL.eq (toSQL T.spotifyTokensC.id) (SQL.string token.id)))
                  Nothing -> runInsert ctx.db (insertForeign T.spotifyTokens [toForeign { userId: user.id, accessToken: access, refreshToken: refresh, spotifyAppId: appId }])
                accounts :: Array SelectSpotifyAccount <- run ctx.db (selectFrom T.spotifyAccounts
                  # where_ (SQL.and (SQL.eq (toSQL T.spotifyAccountsC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.spotifyAccountsC.isBetaUser) (SQL.bool true))) # limit 1)
                case head accounts of
                  Just account | account.email /= "" -> liftEffect (Nats.publishString ctx.nc "rocksky.spotify.user" account.email)
                  _ -> pure unit
                redirect
          _ -> redirect
      _ -> redirect
  Hono.post app "/join" \c -> do
    liftEffect (Metrics.count ctx.metrics "POST" "/spotify/join")
    Rest.withUser ctx c \user -> do
      body <- Hono.reqJson c
      case parseEmail body of
        Left errors -> Rest.text c 400 ("Invalid email: " <> formatZodLike errors)
        Right { email } -> do
          apps :: Array { spotifyAppId :: String } <- run ctx.db
            (selectFieldsFrom { appId: toSQL T.spotifyAppsC.id, spotifyAppId: toSQL T.spotifyAppsC.spotifyAppId, accountCount: SQL.as "account_count" (SQL.countOf (toSQL T.spotifyAccountsC.id)) } T.spotifyApps
              # leftJoin T.spotifyAccounts (SQL.eq (toSQL T.spotifyAppsC.spotifyAppId) (toSQL T.spotifyAccountsC.spotifyAppId))
              # groupBy [toSQL T.spotifyAppsC.id, toSQL T.spotifyAppsC.spotifyAppId]
              # having (SQL.lt (SQL.countOf (toSQL T.spotifyAccountsC.id)) (SQL.int 25)))
          inserted <- attempt (runInsert ctx.db (insertForeign T.spotifyAccounts [toForeign { userId: user.id, email, isBetaUser: false, spotifyAppId: fromMaybe undefined (toForeign <<< _.spotifyAppId <$> head apps) }]))
          case inserted of
            Left e | contains (Pattern "duplicate key value violates unique constraint") (message e) -> throwError e
            Left e -> liftEffect (Log.error (message e))
            Right _ -> pure unit
          void (Fetch.fetchWith "https://beta.rocksky.app" Fetch.defaultOptions
            { method = "POST", headers = Object.fromFoldable [Tuple "Content-Type" "application/json", Tuple "Authorization" ("Bearer " <> env."ROCKSKY_BETA_TOKEN")]
            , body = notNull (toForeign (stringify (toForeign { email }))) })
          Rest.json c 200 (toForeign { status: "ok" })
