module Rocksky.AppProxy.LandingAssets (proxyLandingAsset) where

import Prelude
import Data.Array (filter)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits (drop)
import Effect.Aff (Aff, try)
import Effect.Class (liftEffect)
import Rocksky.AppProxy.Routing (isHtml, isRead, startsWith)
import Rocksky.AppProxy.Web as W

proxyLandingAsset :: W.Request -> Aff (Maybe W.Response)
proxyLandingAsset request = go
  where
  details = W.info request
  head = details.method == "HEAD"
  upstream = "https://rocksky-landing.pages.dev" <> drop 9 details.pathname <> details.search
  headers = filter (\entry -> entry.value /= "") $ map (\name -> W.header name (W.requestHeader request name))
    [ "Accept", "If-None-Match", "If-Modified-Since", "Range", "If-Range" ]
  failure status message = Just <$> liftEffect (W.response status message [ W.header "Cache-Control" "no-store" ] head)
  go
    | not (startsWith "/_landing/" details.pathname) = pure Nothing
    | not (isRead request) = Just <$> liftEffect (W.response 405 "Method not allowed" [ W.header "Allow" "GET, HEAD" ] false)
    | otherwise = do
        result <- try $ W.fetchStatic upstream details.method headers false
        case result of
          Right response
            | (W.status response >= 300 && W.status response < 400 && W.status response /= 304) || isHtml response -> failure 404 "Asset not found"
            | otherwise -> Just <$> liftEffect (W.modifyResponse response [] [ "Set-Cookie" ] head)
          Left _ -> failure 502 "Landing assets unavailable"
