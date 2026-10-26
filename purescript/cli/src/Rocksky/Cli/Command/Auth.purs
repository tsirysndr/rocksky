module Rocksky.Cli.Command.Auth (login, whoami) where

import Prelude
import Control.Promise (Promise, fromAff, toAffE)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Aff (Aff, catchError, throwError, try)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Fetch as Fetch
import Foreign (Foreign)
import Rocksky.Cli.Client as Client
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

foreign import data Server :: Type
foreign import listenImpl :: (Foreign -> Effect (Promise Foreign)) -> Effect (Promise Server)
foreign import close :: Server -> Effect Unit
foreign import appPasswordProfileImpl :: Effect (Promise Foreign)

login :: String -> Aff Unit
login handle = do
  server <- toAffE $ listenImpl (fromAff <<< saveToken)
  catchError (authorize server) \err -> liftEffect (close server) *> throwError err
  where
  saveToken body = do
    let token = Client.field "token" body
    when (token == "") $ throwError (error "Login callback did not contain a session token")
    Runtime.writeState "token.json" (F.stringifyPretty (F.toForeign { token }))
    liftEffect $ Runtime.print "Login successful! Your session token has been saved."
    pure $ F.toForeign { ok: 1 }
  authorize server = do
    response <- Fetch.fetchWith (Client.apiUrl <> "/login")
      ( Fetch.defaultOptions
          { method = "POST"
          , headers = Client.headers (Client.new "")
          , body = toNullable (Just (F.toForeign (F.stringify (F.toForeign { handle, cli: true }))))
          }
      )
    unless (Fetch.ok response) $ throwError (error "Failed to login, please check your handle and try again.")
    raw <- Fetch.text response
    let
      url = case F.parseJson raw of
        Right value -> fromMaybe raw (F.asString value)
        Left _ -> raw
    if not (contains (Pattern "authorize") url) then do
      liftEffect $ close server
      throwError (error "Failed to login, please check your handle and try again.")
    else do
      liftEffect $ Runtime.print ("Please visit this URL to authorize the app:\n" <> Runtime.style "link" url)
      Runtime.openBrowser url

whoami :: Aff Unit
whoami = do
  identifier <- liftEffect $ Runtime.env "ROCKSKY_IDENTIFIER"
  password <- liftEffect $ Runtime.env "ROCKSKY_PASSWORD"
  if identifier /= "" && password /= "" then do
    Runtime.initializeDatabase
    toAffE appPasswordProfileImpl >>= display
  else do
    token <- liftEffect Runtime.loadToken
    if token == "" then liftEffect $ Runtime.printError "You are not logged in. Please run `rocksky login <username>.bsky.social` first."
    else do
      result <- try $ Client.getCurrentUser (Client.new token)
      case result of
        Right user -> display user
        Left _ -> liftEffect $ Runtime.printError "Failed to fetch user data. Please check your token and try again."
  where
  display user = liftEffect do
    Runtime.print ("You are logged in as " <> Client.field "handle" user <> " (" <> Client.field "displayName" user <> ").")
    Runtime.print ("View your profile at: " <> Runtime.style "link" ("https://rocksky.app/profile/" <> Client.field "handle" user))
