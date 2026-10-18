-- | Validated environment (`src/lib/env.ts`). Read once at startup through
-- | envalid, which exits the process with a report when a required variable
-- | is missing, as the TypeScript module does at import time.
module Rocksky.Lib.Env (Env, env, isProduction) where

import Prelude

import Data.Maybe (Maybe(..))
import Dotenv as Dotenv
import Effect.Unsafe (unsafePerformEffect)
import Envalid (bool, cleanEnv, defaults, host, num, port, str, strChoices)

type Env =
  { "NODE_ENV" :: String
  , "HOST" :: String
  , "PORT" :: Int
  , "PUBLIC_URL" :: String
  , "DB_PATH" :: String
  , "KV_DB_PATH" :: String
  , "COOKIE_SECRET" :: String
  , "FRONTEND_URL" :: String
  , "JWT_SECRET" :: String
  , "SPOTIFY_REDIRECT_URI" :: String
  , "SPOTIFY_CLIENT_ID" :: String
  , "SPOTIFY_CLIENT_SECRET" :: String
  , "SPOTIFY_API_URL" :: String
  , "SPOTIFY_ENCRYPTION_KEY" :: String
  , "SPOTIFY_ENCRYPTION_IV" :: String
  , "ROCKSKY_BETA_TOKEN" :: String
  , "XATA_POSTGRES_URL" :: String
  , "XATA_READ_POSTGRES_URL" :: String
  , "XATA_WRITE_POSTGRES_URL" :: String
  , "NATS_URL" :: String
  , "ANALYTICS" :: String
  , "DROPBOX_CLIENT_ID" :: String
  , "DROPBOX_CLIENT_SECRET" :: String
  , "DROPBOX_REDIRECT_URI" :: String
  , "GOOGLE_REDIRECT_URI" :: String
  , "GOOGLE_DRIVE" :: String
  , "DROPBOX" :: String
  , "TRACKLIST" :: String
  , "REDIS_URL" :: String
  , "MATCHING_URL" :: String
  , "SUBMISSIONS_URL" :: String
  , "SUBMISSIONS_SECRET" :: String
  , "MUSICBRAINZ_URL" :: String
  , "DEEZER_URL" :: String
  , "DISCOGS_URL" :: String
  , "DISCOGS_ENRICHMENT_ENABLED" :: Boolean
  , "PRIVATE_KEY_1" :: String
  , "PRIVATE_KEY_2" :: String
  , "PRIVATE_KEY_3" :: String
  , "DISABLED_TEALFM" :: String
  , "STORAGE_ENCRYPTION_KEY" :: String
  , "S3_ENDPOINT" :: String
  , "S3_REGION" :: String
  , "S3_ACCESS_KEY_ID" :: String
  , "S3_SECRET_ACCESS_KEY" :: String
  , "S3_BUCKET_NAME" :: String
  , "S3_COVERS_BUCKET_NAME" :: String
  , "CDN_URL" :: String
  , "MEDIA_CDN_URL" :: String
  , "TYPESENSE_HOST" :: String
  , "TYPESENSE_PORT" :: Int
  , "TYPESENSE_PROTOCOL" :: String
  , "TYPESENSE_API_KEY" :: String
  , "NAVIDROME_INTERNAL_URL" :: String
  , "NAVIDROME_INTERNAL_SECRET" :: String
  , "ROCKSKY_FEEDGEN_DID" :: String
  , "ROCKSKY_FEEDGEN_PORT" :: Int
  , "PDS_HOST_OVERRIDES" :: String
  , "ROCKSKY_SIGNUP_PDS" :: String
  , "SCROBBLE_ABUSE_WINDOW" :: Number
  , "SCROBBLE_ABUSE_MAX" :: Number
  , "SCROBBLE_ABUSE_BLOCK" :: Number
  , "PG_MAX_CONNECTIONS" :: Number
  , "PG_STATEMENT_TIMEOUT" :: Number
  , "PG_APP_NAME" :: String
  }

required :: { default :: Maybe String, devDefault :: Maybe String, desc :: Maybe String }
required = defaults

withDefault :: forall a. a -> { default :: Maybe a, devDefault :: Maybe a, desc :: Maybe String }
withDefault d = defaults { default = Just d }

devDefault :: forall a. a -> { default :: Maybe a, devDefault :: Maybe a, desc :: Maybe String }
devDefault d = defaults { devDefault = Just d }

env :: Env
env = unsafePerformEffect do
  Dotenv.config
  cleanEnv
    { "NODE_ENV": strChoices [ "development", "production", "test" ] (withDefault "development")
    , "HOST": host (withDefault "localhost")
    , "PORT": port (withDefault 8000)
    , "PUBLIC_URL": str (withDefault "http://localhost:8000")
    , "DB_PATH": str (devDefault ":memory:")
    , "KV_DB_PATH": str (devDefault ":memory:")
    , "COOKIE_SECRET": str (devDefault "00000000000000000000000000000000")
    , "FRONTEND_URL": str (devDefault "http://localhost:5174")
    , "JWT_SECRET": str (devDefault "00000000000000000000000000000000")
    , "SPOTIFY_REDIRECT_URI": str (devDefault "http://localhost:8000/spotify/callback")
    , "SPOTIFY_CLIENT_ID": str required
    , "SPOTIFY_CLIENT_SECRET": str required
    , "SPOTIFY_API_URL": str (withDefault "https://api.spotify.com/v1")
    , "SPOTIFY_ENCRYPTION_KEY": str required
    , "SPOTIFY_ENCRYPTION_IV": str required
    , "ROCKSKY_BETA_TOKEN": str required
    -- Read+write endpoint. Still the only required one: the split URLs below
    -- both fall back to it.
    , "XATA_POSTGRES_URL": str required
    -- Read-only replica: lags the primary, so it must not serve anything that
    -- has to reflect a write that just happened.
    , "XATA_READ_POSTGRES_URL": str (withDefault "")
    , "XATA_WRITE_POSTGRES_URL": str (withDefault "")
    , "NATS_URL": str (withDefault "nats://localhost:4222")
    , "ANALYTICS": str (withDefault "http://localhost:7879")
    , "DROPBOX_CLIENT_ID": str required
    , "DROPBOX_CLIENT_SECRET": str required
    , "DROPBOX_REDIRECT_URI": str required
    , "GOOGLE_REDIRECT_URI": str required
    , "GOOGLE_DRIVE": str (withDefault "http://localhost:7880")
    , "DROPBOX": str (withDefault "http://localhost:7881")
    , "TRACKLIST": str (withDefault "http://localhost:7884")
    , "REDIS_URL": str (withDefault "redis://localhost:6379")
    , "MATCHING_URL": str (withDefault "http://127.0.0.1:8097")
    , "SUBMISSIONS_URL": str (withDefault "http://127.0.0.1:8098")
    -- No insecure development fallback: both the queue and callback require it.
    , "SUBMISSIONS_SECRET": str (withDefault "")
    , "MUSICBRAINZ_URL": str (withDefault "http://localhost:8088")
    , "DEEZER_URL": str (withDefault "http://localhost:8090")
    , "DISCOGS_URL": str (withDefault "http://localhost:8095")
    , "DISCOGS_ENRICHMENT_ENABLED": bool (withDefault false)
    , "PRIVATE_KEY_1": str required
    , "PRIVATE_KEY_2": str required
    , "PRIVATE_KEY_3": str required
    , "DISABLED_TEALFM": str (withDefault "")
    , "STORAGE_ENCRYPTION_KEY": str (devDefault "0000000000000000000000000000000000000000000000000000000000000000")
    , "S3_ENDPOINT": str required
    , "S3_REGION": str (withDefault "auto")
    , "S3_ACCESS_KEY_ID": str required
    , "S3_SECRET_ACCESS_KEY": str required
    , "S3_BUCKET_NAME": str (withDefault "rocksky-library")
    , "S3_COVERS_BUCKET_NAME": str (withDefault "rocksky")
    , "CDN_URL": str (withDefault "https://cdn.rocksky.app")
    , "MEDIA_CDN_URL": str (withDefault "https://files.rocksky.app")
    , "TYPESENSE_HOST": str (withDefault "localhost")
    , "TYPESENSE_PORT": port (withDefault 8108)
    , "TYPESENSE_PROTOCOL": strChoices [ "http", "https" ] (withDefault "http")
    , "TYPESENSE_API_KEY": str required
    -- The internal navidrome (Subsonic-compat) service the app.rocksky.library.*
    -- methods proxy to. Server-to-server only.
    , "NAVIDROME_INTERNAL_URL": str (withDefault "http://127.0.0.1:4533")
    , "NAVIDROME_INTERNAL_SECRET": str (devDefault "")
    -- The did:web every Rocksky-native feed is registered under (see getFeed).
    , "ROCKSKY_FEEDGEN_DID": str (withDefault "did:web:discover.rocksky.app")
    -- No devDefault on purpose: prod runs with NODE_ENV=development, so a
    -- devDefault silently becomes the production value.
    , "ROCKSKY_FEEDGEN_PORT": port (withDefault 8003)
    -- PDS hosts unreachable from this server, mapped to a reverse proxy that is
    -- (see Rocksky.Lib.PdsProxy). "" disables the mechanism.
    , "PDS_HOST_OVERRIDES": str (withDefault "caramelo.social.br=caramelo.tsiry.workers.dev")
    , "ROCKSKY_SIGNUP_PDS": str (withDefault "https://rocksky.social")
    -- Bot-scrobble guard (see Rocksky.Lib.ScrobbleGuard). SCROBBLE_ABUSE_MAX=0 disables it.
    , "SCROBBLE_ABUSE_WINDOW": num (withDefault 1800.0)
    , "SCROBBLE_ABUSE_MAX": num (withDefault 25.0)
    , "SCROBBLE_ABUSE_BLOCK": num (withDefault 3600.0)
    , "PG_MAX_CONNECTIONS": num (withDefault 20.0)
    -- Coarse server-side backstop for a single statement, kept above the longest
    -- handler timeout (120s charts) so it never truncates a legitimately slow query.
    , "PG_STATEMENT_TIMEOUT": num (withDefault 60000.0)
    , "PG_APP_NAME": str (withDefault "")
    }

isProduction :: Boolean
isProduction = env."NODE_ENV" == "production"
