-- | The OAuth client (`src/auth/client.ts`).
module Rocksky.Auth.Client (scopes, createClient) where

import Prelude

import Atproto.JwkJose as JwkJose
import Atproto.OAuthClientNode (Client, keysetFromKeys)
import Atproto.OAuthClientNode as OAuth
import Data.Maybe (Maybe(..))
import Data.Nullable (toNullable)
import Data.String (Pattern(..), contains, joinWith)
import Data.String as String
import Data.Traversable (traverse)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import IORedis as IORedis
import JSURI (encodeURIComponent)
import Redlock as Redlock
import Rocksky.Auth.OauthClient as Custom
import Rocksky.Auth.Storage (sessionStore, stateStore)
import Rocksky.Db (Database)
import Rocksky.Lib.Env (env)

scopes :: Array String
scopes =
  [ "atproto"
  , "repo:app.rocksky.album"
  , "repo:app.rocksky.artist"
  , "repo:app.rocksky.graph.follow"
  , "repo:app.rocksky.like"
  , "repo:app.rocksky.playlist"
  , "repo:app.rocksky.playlist.song"
  , "repo:app.rocksky.scrobble"
  , "repo:app.rocksky.shout"
  , "repo:app.rocksky.song"
  , "repo:app.rocksky.feed.generator"
  , "repo:fm.teal.feed.play"
  , "repo:fm.teal.actor.status"
  , "repo:fm.teal.alpha.feed.play"
  , "repo:fm.teal.alpha.actor.status"
  , "repo:app.rocksky.actor.status"
  , "repo:app.rocksky.rockbox.audio.settings"
  , "repo:app.rocksky.equalizer"
  , "repo:community.lexicon.calendar.rsvp"
  ]

-- | `pdsProxyFetch` is passed in so metadata resolution, PAR/token calls and
-- | every DPoP-signed request go through the host override (see Rocksky.Lib.PdsProxy).
createClient :: Database -> Foreign -> Aff Client
createClient db pdsProxyFetch = do
  let
    publicUrl = env."PUBLIC_URL"
    isLocal = contains (Pattern "localhost") publicUrl
    url = if isLocal then "http://127.0.0.1:" <> show env."PORT" else publicUrl
    https = String.take 5 url == "https"
    enc s = case encodeURIComponent s of
      Just e -> e
      Nothing -> s
    scope = joinWith " " scopes
  redis <- liftEffect (IORedis.create env."REDIS_URL")
  redlock <- liftEffect (Redlock.create [ redis ])
  keyset <-
    if https then do
      keys <- traverse JwkJose.fromImportable [ env."PRIVATE_KEY_1", env."PRIVATE_KEY_2", env."PRIVATE_KEY_3" ]
      pure (Just (keysetFromKeys keys))
    else pure Nothing
  client <- liftEffect $ OAuth.createClient
    { clientMetadata:
        { client_name: "Rocksky"
        , client_id:
            if not isLocal then url <> "/oauth-client-metadata.json"
            else "http://localhost?redirect_uri=" <> enc (url <> "/oauth/callback") <> "&scope=" <> enc scope
        , client_uri: url
        , redirect_uris: [ url <> "/oauth/callback" ]
        , scope
        , grant_types: [ "authorization_code", "refresh_token" ]
        , response_types: [ "code" ]
        , application_type: "web"
        , token_endpoint_auth_method: if https then "private_key_jwt" else "none"
        , token_endpoint_auth_signing_alg: toNullable (if https then Just "ES256" else Nothing)
        , dpop_bound_access_tokens: true
        , jwks_uri: toNullable (if https then Just (url <> "/jwks.json") else Nothing)
        }
    , keyset
    , stateStore: stateStore db
    , sessionStore: sessionStore db
    , requestLock: Just \key fn -> Redlock.withLock redlock [ key ] 45000 fn
    , fetch: Just pdsProxyFetch
    }
  liftEffect (Custom.install client)
  pure client
