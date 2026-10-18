module Rocksky.Googledrive.App (app, saveToken, files, authUrl) where

import Prelude
import Control.Alt ((<|>))
import Axios as Axios
import Consola as Log
import Data.Array (head, null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe)
import Data.String (Pattern(..), contains)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (innerJoin, insertForeign, leftJoin, limit, run, runInsert, runInsertReturning, runUpdate, runUpdateReturning, selectFieldsFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import Googleapis as Google
import Hono as Hono
import Node.Encoding (Encoding(..))
import Node.FS.Aff as FS
import Rocksky.Context (Context)
import Rocksky.Lib.Crypto (encrypt)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (parseJson, path, readArrayAt, readStringAt, stringify, toForeign, undefined)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.GoogleDrive (SelectGoogleDrive)
import Rocksky.Schema.GoogleDriveTokens (SelectGoogleDriveToken)
import Rocksky.Types.Email (parseEmail)

credentials :: Aff { clientId :: String, clientSecret :: String }
credentials = do
  raw <- FS.readTextFile UTF8 "credentials.json"
  body <- case parseJson raw of
    Left e -> throwError (error e)
    Right body -> pure body
  let selected = fromMaybe undefined (path "installed" body <|> path "web" body)
  pure { clientId: fromMaybe "" (readStringAt "client_id" selected), clientSecret: fromMaybe "" (readStringAt "client_secret" selected) }

authUrl :: String -> Aff String
authUrl userId = do
  config <- credentials
  client <- liftEffect (Google.newOAuth2 { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: env."GOOGLE_REDIRECT_URI" })
  liftEffect (Google.generateAuthUrl client { accessType: notNull "offline", prompt: notNull "consent", scope: ["https://www.googleapis.com/auth/drive"], state: notNull userId })

saveToken :: Context -> String -> String -> Aff Unit
saveToken ctx state refreshToken = do
  rows :: Array { googleDrive :: SelectGoogleDrive, token :: Nullable SelectGoogleDriveToken } <- run ctx.db
    (selectFieldsFrom { googleDrive: tableSQL T.googleDrive, token: tableSQL T.googleDriveTokens } T.googleDrive
      # innerJoin T.users (SQL.eq (toSQL T.googleDriveC.userId) (toSQL T.usersC.id))
      # leftJoin T.googleDriveTokens (SQL.eq (toSQL T.googleDriveC.googleDriveTokenId) (toSQL T.googleDriveTokensC.id))
      # where_ (SQL.eq (toSQL T.usersC.id) (SQL.string state)) # limit 1)
  encrypted <- liftEffect (encrypt refreshToken env."SPOTIFY_ENCRYPTION_KEY")
  tokens :: Array { id :: String } <- case head rows >>= toMaybe <<< _.token of
    Just token -> runUpdateReturning ctx.db (update T.googleDriveTokens { refreshToken: encrypted } # where_ (SQL.eq (toSQL T.googleDriveTokensC.id) (SQL.string token.id)))
    Nothing -> runInsertReturning ctx.db (insertForeign T.googleDriveTokens [toForeign { refreshToken: encrypted }])
  token <- Rest.firstRow tokens
  case head rows of
    Just row -> runUpdate ctx.db (update T.googleDrive { googleDriveTokenId: token.id, userId: state } # where_ (SQL.eq (toSQL T.googleDriveC.id) (SQL.string row.googleDrive.id)))
    Nothing -> runInsert ctx.db (insertForeign T.googleDrive [toForeign { googleDriveTokenId: token.id, userId: state }])

call :: Context -> String -> Foreign -> Aff Foreign
call ctx method body = Axios.data_ <$> Axios.post ctx.googledrive method body

files :: Context -> String -> Maybe String -> Aff Foreign
files ctx did parent = case parent of
  Just parent_id | parent_id /= "" -> call ctx "googledrive.getFilesInParents" (toForeign { did, parent_id })
  _ -> do
    initial <- call ctx "googledrive.getMusicDirectory" (toForeign { did })
    list <- case readArrayAt "files" initial of
      Nothing -> throwError (error "Invalid music directory response")
      Just rows -> pure rows
    directory <- if null list then do
      void (call ctx "googledrive.createMusicDirectory" (toForeign { did }))
      call ctx "googledrive.getMusicDirectory" (toForeign { did })
      else pure initial
    parent_id <- case readStringAt "files.0.id" directory of
      Nothing -> throwError (error "Music directory missing")
      Just id -> pure id
    call ctx "googledrive.getFilesInParents" (toForeign { did, parent_id })

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  let count verb route = liftEffect (Metrics.count ctx.metrics verb route)
  Hono.get a "/login" \c -> do
    count "GET" "/googledrive/login"
    Rest.withUser ctx c \user -> do
      url <- authUrl user.id
      Rest.json c 200 (toForeign { authUrl: url })
  Hono.get a "/oauth/callback" \c -> do
    count "GET" "/googledrive/oauth/callback"
    config <- credentials
    http <- liftEffect (Axios.create (Axios.defaultConfig ""))
    response <- Axios.postForm http "https://oauth2.googleapis.com/token"
      (Object.fromFoldable [Tuple "code" (fromMaybe "" (Hono.reqQuery c "code")), Tuple "client_id" config.clientId, Tuple "client_secret" config.clientSecret, Tuple "redirect_uri" env."GOOGLE_REDIRECT_URI", Tuple "grant_type" "authorization_code"])
      Axios.defaultRequestOptions
    token <- case readStringAt "refresh_token" (Axios.data_ response) of
      Nothing -> throwError (error "Missing refresh token")
      Just token -> pure token
    saveToken ctx (fromMaybe "" (Hono.reqQuery c "state")) token
    liftEffect (Hono.redirect c (env."FRONTEND_URL" <> "/googledrive") 302)
  Hono.post a "/join" \c -> do
    count "POST" "/googledrive/join"
    Rest.withUser ctx c \user -> do
      body <- Hono.reqJson c
      case parseEmail body of
        Left errors -> Rest.text c 400 ("Invalid email: " <> formatZodLike errors)
        Right { email } -> do
          inserted <- attempt (runInsert ctx.db (insertForeign T.googleDriveAccounts [toForeign { userId: user.id, email, isBetaUser: false }]))
          case inserted of
            Left e | contains (Pattern "duplicate key value violates unique constraint") (message e) -> throwError e
            Left e -> liftEffect (Log.error (message e))
            Right _ -> pure unit
          void (Fetch.fetchWith "https://beta.rocksky.app" Fetch.defaultOptions
            { method = "POST"
            , headers = Object.fromFoldable [Tuple "Content-Type" "application/json", Tuple "Authorization" ("Bearer " <> env."ROCKSKY_BETA_TOKEN")]
            , body = notNull (toForeign (stringify (toForeign { email }))) })
          Rest.json c 200 (toForeign { status: "ok" })
  Hono.get a "/files" \c -> do
    count "GET" "/googledrive/files"
    Rest.withUser ctx c \user -> do
      result <- attempt (files ctx user.did (Hono.reqQuery c "parent_id"))
      case result of
        Right body -> Rest.json c 200 body
        Left e | Axios.isAxiosError e -> do
          liftEffect (Log.errorF "Axios error:" [fromMaybe (toForeign (message e)) (Axios.errorData e)])
          url <- authUrl user.id
          Rest.json c 200 (toForeign { error: "Failed to fetch files", authUrl: url })
        Left e -> throwError e
  Hono.get a "/files/:id" \c -> do
    count "GET" "/googledrive/files/:id"
    Rest.withUser ctx c \user -> do
      body <- call ctx "googledrive.getFile" (toForeign { did: user.did, file_id: Hono.reqParam c "id" })
      Rest.json c 200 body
  Hono.get a "/files/:id/download" \c -> do
    count "GET" "/googledrive/files/:id/download"
    Rest.withUser ctx c \user -> do
      response <- Axios.post ctx.googledrive "googledrive.downloadFile" (toForeign { did: user.did, file_id: Hono.reqParam c "id" })
      let header name fallback = case Object.lookup name (Axios.headers response) of
            Just value | value /= "" -> value
            _ -> fallback
      liftEffect (Hono.body c (Axios.data_ response) 200 (Object.fromFoldable
        [Tuple "Content-Type" (header "content-type" "application/octet-stream"), Tuple "Content-Disposition" (header "content-disposition" "attachment")]))
  pure a
