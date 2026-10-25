module Rocksky.AppProxy.Routing where

import Prelude
import Data.Array (elem)
import Data.Foldable (any)
import Data.Maybe (fromMaybe, isJust)
import Data.Nullable (toMaybe)
import Data.String (Pattern(..), split, toLower, trim, contains)
import Rocksky.AppProxy.Web as Web

startsWith :: String -> String -> Boolean
startsWith prefix value = Web.matches ("^" <> prefix) value

isMobile :: Web.Request -> Boolean
isMobile request = any (\part -> contains (Pattern part) agent)
  [ "android", "webos", "iphone", "ipad", "ipod", "blackberry", "iemobile", "opera mini" ]
  where
  agent = toLower (Web.requestHeader request "User-Agent")

appHost :: Web.Request -> String
appHost request = if isMobile request then "m.rocksky.app" else "rocksky.pages.dev"

hasSessionHint :: String -> Boolean
hasSessionHint = any (\part -> trim part == "rocksky_session_hint=1") <<< split (Pattern ";")

isAppHandoff :: Web.Request -> Boolean
isAppHandoff request = isJust (toMaybe (Web.query request "did"))
  || isJust (toMaybe (Web.query request "cli"))
  || Web.matches "^expired$" (value "session")
  || Web.matches "^1$" (value "__rocksky_app")
  where
  value name = fromMaybe "" (toMaybe (Web.query request name))

isApiRoute :: String -> Boolean
isApiRoute path = elem path [ "/login", "/profile", "/token", "/now-playing", "/ws", "/oauth-client-metadata.json", "/jwks.json" ]
  || any (\prefix -> startsWith prefix path)
    [ "/oauth/callback"
    , "/users"
    , "/albums"
    , "/artists"
    , "/tracks"
    , "/scrobbles"
    , "/likes"
    , "/spotify"
    , "/dropbox/oauth/callback"
    , "/googledrive/oauth/callback"
    , "/dropbox/files"
    , "/dropbox/file"
    , "/googledrive/files"
    , "/dropbox/login"
    , "/googledrive/login"
    , "/dropbox/join"
    , "/googledrive/join"
    , "/search"
    , "/public/scrobbles"
    , "/notifications"
    , "/uploads"
    ]

isRead :: Web.Request -> Boolean
isRead request = elem (Web.info request).method [ "GET", "HEAD" ]

isHtml :: Web.Response -> Boolean
isHtml response = contains (Pattern "text/html") (toLower (Web.responseHeader response "Content-Type"))

isOk :: Web.Response -> Boolean
isOk response = Web.status response >= 200 && Web.status response < 300
