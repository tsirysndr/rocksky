module Rocksky.AppProxy.Homepage (proxyHomepage) where

import Prelude
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Effect.Aff (Aff, try)
import Effect.Class (liftEffect)
import Rocksky.AppProxy.Routing (appHost, hasSessionHint, isAppHandoff, isOk, isRead)
import Rocksky.AppProxy.Web as W

proxyHomepage :: W.Request -> Aff (Maybe W.Response)
proxyHomepage request = go
  where
  details = W.info request
  head = details.method == "HEAD"
  atpassport = details.pathname == "/atpassport/callback"
  appIndex = details.pathname == "/index.html"
  eligible = (atpassport || appIndex || details.pathname == "/") && isRead request
  app = appIndex || (not atpassport && (hasSessionHint (W.requestHeader request "Cookie") || isAppHandoff request))
  upstream = "https://" <> (if app then appHost request else "rocksky-landing.pages.dev") <> "/"
  go
    | not eligible = pure Nothing
    | otherwise = do
        result <- try $ W.fetchStatic upstream details.method [] true
        case result of
          Right response | isOk response && contains (Pattern "text/html") (W.responseHeader response "Content-Type") ->
            Just <$> liftEffect
              ( W.modifyResponse response
                  [ W.header "Cache-Control" "private, no-store"
                  , W.header "CDN-Cache-Control" "no-store"
                  , W.header "Cloudflare-CDN-Cache-Control" "no-store"
                  , W.header "Vary" "Cookie, User-Agent"
                  ]
                  [ "Set-Cookie", "ETag", "Last-Modified", "Expires" ]
                  head
              )
          _ -> Just <$> liftEffect (W.response 502 "Rocksky is temporarily unavailable. Please reload." [ W.header "Cache-Control" "no-store" ] head)
