module Rocksky.AppProxy.HtmlRewriter (OgTarget, matchOgTarget, fetchOgData, headMeta, rewriteHtml) where

import Prelude
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.String (Pattern(..), joinWith, split)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.AppProxy.Routing (isOk, startsWith)
import Rocksky.AppProxy.Web as W

data OgTarget = Profile String | RecordTarget String String String

matchOgTarget :: String -> Maybe OgTarget
matchOgTarget path = case split (Pattern "/") path of
  [ "", "profile", handle ] | handle /= "" -> Just (Profile (W.decode handle))
  [ "", did, kind, rkey ]
    | startsWith "did:plc:.+" did && W.matches "^(scrobble|album|artist|song)$" kind && rkey /= "" ->
        Just (RecordTarget kind (W.decode did) (W.decode rkey))
  _ -> Nothing

fetchOgData :: W.Request -> Aff (Maybe W.OgData)
fetchOgData request = do
  response <- W.fetchGet (W.ogUrl request)
  if isOk response then Just <$> W.readOg response else pure Nothing

escapeAttr :: String -> String
escapeAttr = W.replaceAll ">" "&gt;" <<< W.replaceAll "<" "&lt;" <<< W.replaceAll "\"" "&quot;" <<< W.replaceAll "&" "&amp;"

headMeta :: String -> W.OgData -> String
headMeta url og = joinWith "\n"
  [ "<title>" <> escapeAttr og.title <> "</title>"
  , meta "name" "description" og.description
  , meta "property" "og:title" og.title
  , meta "property" "og:description" og.description
  , meta "property" "og:image" og.image
  , meta "property" "og:url" (fromMaybe url (toMaybe og.url))
  , meta "property" "og:type" (fromMaybe "website" (toMaybe og.type))
  , meta "name" "twitter:card" (fromMaybe "summary_large_image" (toMaybe og.twitterCard))
  , meta "name" "twitter:title" og.title
  , meta "name" "twitter:description" og.description
  , meta "name" "twitter:image" og.image
  ]
  where
  meta attr name value = "<meta " <> attr <> "=\"" <> name <> "\" content=\"" <> escapeAttr value <> "\">"

rewriteHtml :: W.Request -> W.Response -> Aff W.Response
rewriteHtml request response = do
  og <- fetchOgData request
  case og of
    Nothing -> pure response
    Just data_ -> liftEffect do
      rewritten <- W.rewrite response (headMeta (W.info request).url data_)
      W.modifyResponse rewritten [ W.header "cache-control" "public, max-age=300" ] [] false
