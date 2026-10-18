-- | `/dropbox` REST routes (`src/dropbox/app.ts`): OAuth connect, beta
-- | sign-up, and proxies to the dropbox service.
module Rocksky.Dropbox.App (app) where

import Prelude

import Axios as Axios
import Consola as Consola
import Data.Array (catMaybes, head)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.String (Pattern(..), contains)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (insertForeign, leftJoin, limit, onConflictDoUpdate, run, runInsert, runInsertReturning, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Crypto (encrypt)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (omitNulls, readStringAt, stringify, toForeign)
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.Dropbox (SelectDropbox)
import Rocksky.Schema.DropboxTokens (SelectDropboxToken)
import Rocksky.Types.Email (parseEmail)

type Authed = { did :: String, userId :: String }

unauthorized :: Hono.Context -> Aff Hono.Response
unauthorized c = liftEffect (Hono.status c 401 *> Hono.text c "Unauthorized")

badRequest :: Hono.Context -> String -> Aff Hono.Response
badRequest c msg = liftEffect (Hono.status c 400 *> Hono.text c msg)

-- | Bearer → user. A failing `verifyToken` is left to throw (a 500), as in TS.
withUser :: Context -> Hono.Context -> (Authed -> Aff Hono.Response) -> Aff Hono.Response
withUser ctx c k = case bearerFrom (Hono.reqHeader c "authorization") of
  Nothing -> unauthorized c
  Just bearer -> do
    payload <- verifyToken ctx.db bearer
    let did = fromMaybe "" (toMaybe payload.did)
    users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
    case head users of
      Nothing -> unauthorized c
      Just u -> k { did, userId: u.id }

-- | `ctx.dropbox.post(method, body)` → `.data`.
call :: Context -> String -> Foreign -> Aff Foreign
call ctx method body = Axios.data_ <$> Axios.post ctx.dropbox method body

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  let count m r = liftEffect (Metrics.count ctx.metrics m r)

  Hono.get a "/login" \c -> do
    count "GET" "/dropbox/login"
    withUser ctx c \user -> do
      let
        clientId = env."DROPBOX_CLIENT_ID"
        redirectUri = "https://www.dropbox.com/oauth2/authorize?client_id=" <> clientId <> "&redirect_uri=" <> env."DROPBOX_REDIRECT_URI" <> "&response_type=code&token_access_type=offline&state=" <> user.userId
      liftEffect (Hono.json c (toForeign { redirectUri }))

  Hono.get a "/oauth/callback" \c -> do
    count "GET" "/dropbox/oauth/callback"
    let
      code = Hono.reqQuery c "code"
      state = fromMaybe "" (Hono.reqQuery c "state")
    http <- liftEffect (Axios.create (Axios.defaultConfig ""))
    response <- Axios.postForm http "https://api.dropboxapi.com/oauth2/token"
      ( Object.fromFoldable $ catMaybes
          [ Tuple "code" <$> code
          , Just (Tuple "grant_type" "authorization_code")
          , Just (Tuple "client_id" env."DROPBOX_CLIENT_ID")
          , Just (Tuple "client_secret" env."DROPBOX_CLIENT_SECRET")
          , Just (Tuple "redirect_uri" env."DROPBOX_REDIRECT_URI")
          ]
      )
      Axios.defaultRequestOptions
    refreshToken <- case readStringAt "refresh_token" (Axios.data_ response) of
      Just t -> pure t
      Nothing -> throwError (error "refresh_token missing from Dropbox token response")
    rows :: Array { dropbox :: SelectDropbox, dropbox_tokens :: Nullable SelectDropboxToken } <- run ctx.db
      ( selectFieldsFrom { dropbox: tableSQL T.dropbox, dropbox_tokens: tableSQL T.dropboxTokens } T.dropbox
          # where_ (SQL.eq (toSQL T.dropboxC.userId) (SQL.string state))
          # leftJoin T.dropboxTokens (SQL.eq (toSQL T.dropboxTokensC.id) (toSQL T.dropboxC.dropboxTokenId))
          # limit 1
      )
    -- The TS destructures `res[0]` unguarded, so a user with no dropbox row
    -- fails here too.
    existing <- case head rows of
      Just r -> pure r
      Nothing -> throwError (error "Cannot destructure property 'dropbox' of undefined")
    encrypted <- liftEffect (encrypt refreshToken env."SPOTIFY_ENCRYPTION_KEY")
    tokens :: Array { id :: String } <- runInsertReturning ctx.db
      ( insertForeign T.dropboxTokens
          [ omitNulls (toForeign { id: toNullable (map _.id (toMaybe existing.dropbox_tokens)), refreshToken: encrypted }) ]
          # onConflictDoUpdate { target: [ toSQL T.dropboxTokensC.id ], set: { refreshToken: encrypted }, where_: Nothing }
      )
    newTokenId <- case head tokens of
      Just t -> pure t.id
      Nothing -> throwError (error "dropbox token upsert returned no row")
    runInsert ctx.db
      ( insertForeign T.dropbox
          [ omitNulls (toForeign { id: toNullable (Just existing.dropbox.id), dropboxTokenId: newTokenId, userId: state }) ]
          # onConflictDoUpdate { target: [ toSQL T.dropboxC.id ], set: { dropboxTokenId: newTokenId, userId: state }, where_: Nothing }
      )
    liftEffect (Hono.redirect c (env."FRONTEND_URL" <> "/dropbox") 302)

  Hono.post a "/join" \c -> do
    count "POST" "/dropbox/join"
    withUser ctx c \user -> do
      body <- Hono.reqJson c
      case parseEmail body of
        Left errs -> badRequest c ("Invalid email: " <> formatZodLike errs)
        Right { email } -> do
          r <- attempt $ runInsert ctx.db
            (insertForeign T.dropboxAccounts [ toForeign { userId: user.userId, email, isBetaUser: false } ])
          case r of
            Left e
              | not (contains (Pattern "invalid record: column [user_id]: is not unique") (message e)) -> liftEffect (Consola.error (message e))
              | otherwise -> throwError e
            Right _ -> pure unit
          void $ Fetch.fetchWith "https://beta.rocksky.app"
            Fetch.defaultOptions
              { method = "POST"
              , headers = Object.fromFoldable
                  [ Tuple "Content-Type" "application/json"
                  , Tuple "Authorization" ("Bearer " <> env."ROCKSKY_BETA_TOKEN")
                  ]
              , body = toNullable (Just (toForeign (stringify (toForeign { email }))))
              }
          liftEffect (Hono.json c (toForeign { status: "ok" }))

  Hono.get a "/files" \c -> do
    count "GET" "/dropbox/files"
    withUser ctx c \{ did } -> case Hono.reqQuery c "path" of
      Just path | path /= "" -> do
        data_ <- call ctx "dropbox.getFilesAt" (toForeign { did, path })
        liftEffect (Hono.json c data_)
      _ -> do
        r <- attempt (call ctx "dropbox.getFiles" (toForeign { did }))
        data_ <- case r of
          Right d -> pure d
          Left _ -> do
            _ <- call ctx "dropbox.createMusicFolder" (toForeign { did })
            call ctx "dropbox.getFiles" (toForeign { did })
        liftEffect (Hono.json c data_)

  Hono.get a "/temporary-link" \c -> do
    count "GET" "/dropbox/temporary-link"
    withUser ctx c \{ did } -> case Hono.reqQuery c "path" of
      Just path | path /= "" -> do
        data_ <- call ctx "dropbox.getTemporaryLink" (toForeign { did, path })
        liftEffect (Hono.json c data_)
      _ -> badRequest c "Bad Request, path is required"

  Hono.get a "/files/:id" \c -> do
    count "GET" "/dropbox/files/:id"
    withUser ctx c \{ did } -> do
      data_ <- call ctx "dropbox.getMetadata" (toForeign { did, path: Hono.reqParam c "id" })
      liftEffect (Hono.json c data_)

  Hono.get a "/file" \c -> do
    count "GET" "/dropbox/file"
    withUser ctx c \{ did } -> case Hono.reqQuery c "path" of
      Just path | path /= "" -> do
        data_ <- call ctx "dropbox.getMetadata" (toForeign { did, path })
        liftEffect (Hono.json c data_)
      _ -> badRequest c "Bad Request, path is required"

  Hono.get a "/download" \c -> do
    count "GET" "/dropbox/download"
    withUser ctx c \{ did } -> case Hono.reqQuery c "path" of
      Just path | path /= "" -> do
        response <- Axios.post ctx.dropbox "dropbox.downloadFile" (toForeign { did, path })
        let
          hs = Axios.headers response
          orDefault k d = case Object.lookup k hs of
            Just v | v /= "" -> v
            _ -> d
        liftEffect do
          Hono.setHeader c "Content-Type" (orDefault "content-type" "application/octet-stream")
          Hono.setHeader c "Content-Disposition" (orDefault "content-disposition" "attachment")
          Hono.body c (Axios.data_ response) 200 Object.empty
      _ -> badRequest c "Bad Request, path is required"

  pure a
