module Rocksky.Bsky.App (app) where

import Prelude
import Atproto.Api as Api
import Atproto.OAuthClientNode as OAuth
import Atproto.Syntax (isValidHandle)
import Consola as Log
import Control.Parallel (parallel, sequential)
import Data.Array (head, index)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (notNull, toMaybe, toNullable)
import Data.Number (floor)
import Data.String (Pattern(..), contains, joinWith, split)
import Drizzle.Builder (insertForeign, limit, orderBy, run, runInsert, runUpdate, selectFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Foreign (Foreign)
import Hono as Hono
import Jsonwebtoken as Jwt
import Kysely as Kysely
import Nats as Nats
import Redis as Redis
import Rocksky.Auth.Client (scopes)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.BskyProfile (fetchBskyProfile)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Jwks (parseJwks)
import Rocksky.Lib.Error (errorName, errorToForeign)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign (deepSnakeCaseKeys, omitNulls, readBooleanAt, readStringAt, stringify, toForeign, undefined)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.SpotifyAccounts (SelectSpotifyAccount)
import Rocksky.Schema.SpotifyTokens (SelectSpotifyToken)

tokenFor :: String -> Boolean -> Effect String
tokenFor did cli = do
  now <- Date.getTime <$> Date.now
  pure (Jwt.sign (toForeign { did, exp: floor (now / 1000.0) + if cli then 60.0 * 60.0 * 24.0 * 365.0 * 1000.0 else 60.0 * 60.0 * 24.0 * 7.0 }) env."JWT_SECRET")

authorize :: Context -> String -> Maybe String -> Aff String
authorize ctx handle prompt = OAuth.authorize ctx.oauthClient handle OAuth.defaultAuthorizeOptions
  { scope = notNull (joinWith " " scopes), prompt = toNullable prompt }

loginPassword :: Context -> String -> String -> Aff String
loginPassword ctx handle password = do
  defaultAgent <- liftEffect (Api.newAtpAgent "https://bsky.social")
  did <- Api.resolveHandle defaultAgent handle
  cached <- Redis.get ctx.redis ("pds:" <> did)
  pds <- case cached of
    Just p | p /= "" -> pure p
    _ -> do
      resolved <- fromMaybe "" <$> extractPdsFromDid did
      Redis.setEx ctx.redis ("pds:" <> did) (60 * 15) resolved
      pure resolved
  agent <- liftEffect (Api.newAtpAgent pds)
  Api.login agent { identifier: handle, password }
  session <- liftEffect (Api.sessionJson agent)
  Kysely.raw ctx.sqliteDb
    "insert into \"auth_session\" (\"key\", \"session\") values (?, ?) on conflict(\"key\") do update set \"session\" = excluded.\"session\""
    [toForeign ("atp:" <> did), toForeign session]
  token <- liftEffect (tokenFor did false)
  pure ("jwt:" <> token)

profile :: Context -> Hono.Context -> String -> Aff Hono.Response
profile ctx c did = do
  agent <- createAgent ctx did
  case agent of
    Nothing -> Rest.text c 401 "Unauthorized"
    Just a -> do
      handle <- ctx.resolver.resolveDidToHandle did
      resolved <- fetchBskyProfile (Just did) (Just a)
      when (handle /= "") do
        inserted <- attempt (runInsert ctx.db (insertForeign T.users
          [toForeign { did, handle, displayName: toNullable resolved.displayName, avatar: fromMaybe "" resolved.avatar }]))
        case inserted of
          Right _ -> pure unit
          Left e | contains (Pattern "invalid record: column [did]: is not unique") (message e) ->
            runUpdate ctx.db (updateForeign T.users (omitNulls (toForeign
              { handle, displayName: toNullable resolved.displayName, avatar: toNullable resolved.avatar }))
              # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)))
          Left e -> liftEffect (Log.error (message e))
        records <- sequential $ { user: _, lastUser: _ }
          <$> parallel (run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1) :: Aff (Array SelectUser))
          <*> parallel (run ctx.db (selectFrom T.users # orderBy [SQL.desc (toSQL T.usersC.createdAt)] # limit 1) :: Aff (Array SelectUser))
        liftEffect (Nats.publishString ctx.nc "rocksky.user" (stringify (deepSnakeCaseKeys (toForeign records.user))))
        last <- Rest.firstRow records.lastUser
        liftEffect (Ref.modify_ (Map.insert "lastUser" last.id) ctx.kv)
      linked <- sequential $ { spotifyUser: _, spotifyToken: _ }
        <$> parallel (run ctx.db (selectFrom T.spotifyAccounts # where_ (SQL.and (SQL.eq (toSQL T.spotifyAccountsC.userId) (SQL.string did)) (SQL.eq (toSQL T.spotifyAccountsC.isBetaUser) (SQL.bool true))) # limit 1) :: Aff (Array SelectSpotifyAccount))
        <*> parallel (run ctx.db (selectFrom T.spotifyTokens # where_ (SQL.eq (toSQL T.spotifyTokensC.userId) (SQL.string did)) # limit 1) :: Aff (Array SelectSpotifyToken))
      let first :: forall row. Array row -> Foreign
          first rows = deepSnakeCaseKeys (fromMaybe undefined (toForeign <$> head rows))
      Rest.json c 200 (omitNulls (toForeign
        { handle, displayName: toNullable resolved.displayName, avatar: toNullable resolved.avatar
        , spotifyUser: first linked.spotifyUser, spotifyConnected: isJust (head linked.spotifyToken)
         , did }))

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  let count method route = liftEffect (Metrics.count ctx.metrics method route)
  Hono.get a "/login" \c -> do
    count "GET" "/login"
    let handle = fromMaybe "" (Hono.reqQuery c "handle")
    let prompt = Hono.reqQuery c "prompt"
    let hasPrompt = fromMaybe "" prompt /= ""
    if not (isValidHandle handle) && not hasPrompt then Rest.text c 400 "Invalid handle"
    else do
      result <- attempt do
        url <- authorize ctx (if hasPrompt then env."ROCKSKY_SIGNUP_PDS" else handle) prompt
        when (fromMaybe "" (Hono.reqQuery c "cli") /= "") (liftEffect (Ref.modify_ (Map.insert ("cli:" <> handle) "1") ctx.kv))
        liftEffect (Hono.redirect c url 302)
      case result of
        Right response -> pure response
        Left e -> Rest.text c 500 (errorName e <> ": " <> message e)
  Hono.post a "/login" \c -> do
    count "POST" "/login"
    body <- Hono.reqJson c
    let handle = fromMaybe "" (readStringAt "handle" body)
    if not (isValidHandle handle) then Rest.text c 400 "Invalid handle"
    else do
      result <- attempt do
        let password = fromMaybe "" (readStringAt "password" body)
        if password /= "" then loginPassword ctx handle password >>= Rest.text c 200
        else do
          url <- authorize ctx handle Nothing
          let cli = fromMaybe false (readBooleanAt "cli" body) || fromMaybe "" (readStringAt "cli" body) /= ""
          when cli (liftEffect (Ref.modify_ (Map.insert ("cli:" <> handle) "1") ctx.kv))
          Rest.text c 200 url
      case result of
        Right response -> pure response
        Left e -> Rest.text c 500 (errorName e <> ": " <> message e)
  Hono.get a "/oauth/callback" \c -> do
    count "GET" "/oauth/callback"
    result <- attempt do
      callback <- OAuth.callback ctx.oauthClient (fromMaybe "" (index (split (Pattern "?") (Hono.reqUrl c)) 1))
      let did = OAuth.sessionDid callback.session
      handle <- ctx.resolver.resolveDidToHandle did
      cli <- liftEffect (Map.lookup ("cli:" <> handle) <$> Ref.read ctx.kv)
      liftEffect (Ref.modify_ (Map.delete ("cli:" <> handle)) ctx.kv)
      token <- liftEffect (tokenFor did (fromMaybe "" cli /= ""))
      liftEffect (Ref.modify_ (Map.insert did token) ctx.kv)
      pure { did, cli }
    case result of
      Left e -> do
        liftEffect (Log.errorF "oauth callback failed" [errorToForeign e])
        liftEffect (Hono.redirect c (env."FRONTEND_URL" <> "?error=1") 302)
      Right { did, cli } -> do
        users :: Array SelectSpotifyAccount <- run ctx.db (selectFrom T.spotifyAccounts
          # where_ (SQL.and (SQL.eq (toSQL T.spotifyAccountsC.userId) (SQL.string did)) (SQL.eq (toSQL T.spotifyAccountsC.isBetaUser) (SQL.bool true))) # limit 1)
        case head users of
          Just user | user.email /= "" -> liftEffect (Nats.publishString ctx.nc "rocksky.spotify.user" user.email)
          _ -> pure unit
        liftEffect (Hono.redirect c (env."FRONTEND_URL" <> "?did=" <> did <> if fromMaybe "" cli == "" then "" else "&cli=" <> fromMaybe "" cli) 302)
  Hono.get a "/profile" \c -> do
    count "GET" "/profile"
    case bearerFrom (Hono.reqHeader c "authorization") of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just bearer -> do
        verified <- verifyToken ctx.db bearer
        profile ctx c (fromMaybe "" (toMaybe verified.did))
  Hono.get a "/client-metadata.json" \c -> do
    count "GET" "/client-metadata.json"
    Rest.json c 200 (OAuth.clientMetadata ctx.oauthClient)
  Hono.get a "/oauth-client-metadata.json" \c -> Rest.json c 200 (OAuth.clientMetadata ctx.oauthClient)
  Hono.get a "/token" \c -> do
    count "GET" "/token"
    case Hono.reqHeader c "session-did" of
      Just did | did /= "" && did /= "null" -> do
        token <- liftEffect (Map.lookup did <$> Ref.read ctx.kv)
        case token of
          Just value | value /= "" -> do
            liftEffect (Ref.modify_ (Map.delete did) ctx.kv)
            Rest.json c 200 (toForeign { token: value })
          _ -> Rest.text c 401 "Unauthorized"
      _ -> Rest.text c 401 "Unauthorized"
  Hono.get a "/jwks.json" \c -> Rest.json c 200 (parseJwks env."JWKS_JSON")
  pure a
