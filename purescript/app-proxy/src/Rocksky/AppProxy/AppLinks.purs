module Rocksky.AppProxy.AppLinks (appLinkResponse) where

import Prelude
import Data.Array (filter, nub)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), split, toUpper, trim)
import Effect (Effect)
import Rocksky.AppProxy.Web as W

appLinkResponse :: String -> W.Environment -> Effect (Maybe W.Response)
appLinkResponse path env = go
  where
  headers = [ W.header "Cache-Control" "public, max-age=3600" ]
  fingerprints = nub $ filter (W.matches "^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$") $
    [ "6D:87:91:43:C4:24:41:00:32:2E:F3:6E:91:9F:40:2C:DD:41:65:C6:9E:E2:49:03:0D:8C:0C:F7:13:36:76:54"
    , "DD:B3:B5:D6:8E:F2:0B:09:86:58:BC:74:3A:B5:55:4B:81:BB:6A:68:D4:DB:F7:76:0D:A0:3A:23:7C:09:15:3B"
    ] <> map (toUpper <<< trim) (split (Pattern ",") (W.envValue env "ANDROID_PLAY_SIGNING_SHA256"))
  team = W.envValue env "APPLE_TEAM_ID"
  details =
    if W.matches "^[A-Z0-9]{10}$" team then
      [ { appID: team <> ".app.rocksky", paths: [ "/profile/*", "/*/song/*", "/*/track/*", "/*/album/*", "/*/artist/*", "/*/scrobble/*" ] } ]
    else []
  go
    | path == "/.well-known/assetlinks.json" = Just <$> W.jsonResponse
        [ { relation: [ "delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds" ]
          , target: { namespace: "android_app", package_name: "app.rocksky", sha256_cert_fingerprints: fingerprints }
          }
        ]
        headers
    | path == "/.well-known/apple-app-site-association" = Just <$> W.jsonResponse
        { applinks: { apps: [] :: Array String, details: details } }
        headers
    | otherwise = pure Nothing
