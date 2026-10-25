module Rocksky.AppProxy.Index (fetch, handleRequest, corsHeaders) where

import Prelude
import Control.Promise (Promise, fromAff)
import Data.Array (elem)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.AppProxy.AppLinks (appLinkResponse)
import Rocksky.AppProxy.Homepage (proxyHomepage)
import Rocksky.AppProxy.HtmlRewriter (rewriteHtml)
import Rocksky.AppProxy.LandingAssets (proxyLandingAsset)
import Rocksky.AppProxy.Metadata as Metadata
import Rocksky.AppProxy.Routing (appHost, isApiRoute, isHtml, isOk, startsWith)
import Rocksky.AppProxy.Web as W

corsHeaders :: String -> Array W.Header
corsHeaders origin =
  [ W.header "Access-Control-Allow-Origin" (if elem origin [ "https://m.rocksky.app", "https://rocksky.app" ] then origin else "https://m.rocksky.app")
  , W.header "Access-Control-Allow-Methods" "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  , W.header "Access-Control-Allow-Headers" "Content-Type, Authorization, Range"
  , W.header "Access-Control-Expose-Headers" "Content-Range, Content-Length, Accept-Ranges"
  , W.header "Access-Control-Max-Age" "86400"
  ]

fetch :: W.Request -> W.Environment -> Effect (Promise W.Response)
fetch request env = fromAff (handleRequest request env)

handleRequest :: W.Request -> W.Environment -> Aff W.Response
handleRequest request env = do
  association <- liftEffect $ appLinkResponse path env
  case association of
    Just response -> pure response
    Nothing | details.method == "OPTIONS" -> liftEffect $ W.response 204 "" cors true
    Nothing -> do
      asset <- proxyLandingAsset request
      case asset of
        Just response -> pure response
        Nothing -> route
  where
  details = W.info request
  path = details.pathname
  cors = corsHeaders (W.requestHeader request "Origin")
  route
    | path == "/privacy-policy" = liftEffect $ W.response 301 "" [ W.header "Location" (W.changePath request "/privacy") ] true
    | startsWith "/rockbox/" path = do
        response <- W.fetch (W.changeHost request "rocksky.pages.dev") request false
        liftEffect $ W.modifyResponse response [ W.header "Access-Control-Allow-Origin" "*" ] [] false
    | path == "/oauth-client-metadata.json" = liftEffect $ W.jsonResponse Metadata.metadata []
    | path == "/jwks.json" = liftEffect $ W.response 200 Metadata.jwks [ W.header "Content-Type" "application/json" ] false
    | isApiRoute path = do
        response <- W.fetch (W.changeHost request "api.rocksky.app") request true
        liftEffect $ W.modifyResponse response
          (cors <> [ W.header "Cache-Control" "no-store, no-cache, must-revalidate, max-age=0" ])
          [ "Expires", "ETag" ]
          false
    | otherwise = do
        homepage <- proxyHomepage request
        case homepage of
          Just response -> pure response
          Nothing -> do
            response <- W.fetch (W.changeHost request (appHost request)) request false
            if not (isOk response) || not (isHtml response) then liftEffect $ W.modifyResponse response cors [] false
            else rewriteHtml request response
