-- | The shared application context (`src/context.ts`), created once in each
-- | entrypoint's `main` and passed explicitly to every module.
module Rocksky.Context (Context, createContext) where

import Prelude

import Atproto.Identity (IdResolver)
import Atproto.Lexicon (Lexicons)
import Atproto.Lexicon as Lexicon
import Atproto.OAuthClientNode (Client)
import Atproto.XrpcServer (AuthVerifier)
import Axios (Instance)
import Axios as Axios
import Consola as Consola
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Nullable (toNullable)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Effect.Ref (Ref)
import Effect.Ref as Ref
import Foreign (Foreign)
import Kysely (Kysely)
import Nats (Connection)
import Nats as Nats
import Node.Process (exit')
import Redis as Redis
import Rocksky.Auth.Client (createClient)
import Rocksky.Db (createDb, migrateToLatest)
import Rocksky.Drizzle (Pools, createPools, ensureWritable)
import Rocksky.Lexicon (loadLexicons)
import Rocksky.Lib.AuthVerifier (authVerifier)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.IdResolver (BidirectionalResolver, createBidirectionalResolver, createIdResolver)
import Rocksky.Lib.PdsProxy (installPdsProxyFetch, pdsProxyFetch)
import Rocksky.Metrics (Metrics)
import Rocksky.Metrics as Metrics
import Rocksky.SqliteKv (sqliteKvDriver)
import Typesense as Typesense
import Unstorage (Storage)
import Unstorage as Unstorage
import Data.Either (Either(..))

type Context =
  { oauthClient :: Client
  , resolver :: BidirectionalResolver
  , baseIdResolver :: IdResolver
  -- | In-process scratch map (CLI login handshakes, last user id).
  , kv :: Ref (Map String String)
  -- | Primary: writes, and reads that must be fresh.
  , db :: Database Postgres
  -- | Read replica (the primary itself when unconfigured): lag-tolerant reads.
  , readDb :: Database Postgres
  , pools :: Pools
  , nc :: Connection
  , analytics :: Instance
  , dropbox :: Instance
  , googledrive :: Instance
  , tracklist :: Instance
  , matching :: Instance
  , musicbrainz :: Instance
  , deezer :: Instance
  , discogs :: Instance
  , redis :: Redis.Client
  , typesense :: Typesense.Client
  , authVerifier :: AuthVerifier
  , sqliteDb :: Kysely
  , sqliteKv :: Storage
  , lexiconDocs :: Array Foreign
  , lexicons :: Lexicons
  , metrics :: Metrics
  }

createContext :: Aff Context
createContext = do
  -- Must run before anything builds an agent or an OAuth client: it swaps the
  -- host of outbound requests to PDSes this server cannot reach directly.
  liftEffect installPdsProxyFetch
  sqliteDb <- liftEffect (createDb env."DB_PATH")
  migrateToLatest sqliteDb
  pools <- liftEffect createPools
  -- Mostly a read API, so a read-only primary is logged as loudly as possible
  -- rather than made fatal: taking the whole API down would be the larger outage.
  w <- attempt (ensureWritable pools)
  case w of
    Left e -> liftEffect (Consola.error ("[db] PRIMARY IS NOT WRITABLE — every write will fail. " <> message e))
    Right _ -> pure unit
  kvDriver <- liftEffect (sqliteKvDriver { location: env."KV_DB_PATH", table: "kv" })
  sqliteKv <- liftEffect (Unstorage.createStorage kvDriver)
  baseIdResolver <- liftEffect (createIdResolver sqliteKv)
  oauthClient <- createClient sqliteDb pdsProxyFetch
  nc <- Nats.connect env."NATS_URL"
  redisClient <- liftEffect (Redis.createClient env."REDIS_URL")
  liftEffect $ Redis.onError redisClient \err -> do
    Consola.errorF "Uncaught Redis Client Error" [ err ]
    exit' 1
  redis <- Redis.connect redisClient
  typesense <- liftEffect $ Typesense.createClient
    { host: env."TYPESENSE_HOST"
    , port: env."TYPESENSE_PORT"
    , protocol: env."TYPESENSE_PROTOCOL"
    , apiKey: env."TYPESENSE_API_KEY"
    , connectionTimeoutSeconds: 2
    }
  lexiconDocs <- loadLexicons
  metrics <- liftEffect Metrics.create
  kv <- liftEffect (Ref.new Map.empty)
  let
    axios base timeout = liftEffect (Axios.create { baseURL: base, timeout: toNullable timeout })
  analytics <- axios env."ANALYTICS" Nothing
  dropbox <- axios env."DROPBOX" Nothing
  googledrive <- axios env."GOOGLE_DRIVE" Nothing
  tracklist <- axios env."TRACKLIST" Nothing
  matching <- axios env."MATCHING_URL" (Just 10000)
  musicbrainz <- axios env."MUSICBRAINZ_URL" Nothing
  deezer <- axios env."DEEZER_URL" Nothing
  -- The service queues for a rate limiter slot before answering, so the
  -- timeout has to outlast its own queue budget (DISCOGS_MAX_WAIT).
  discogs <- axios env."DISCOGS_URL" (Just 45000)
  pure
    { oauthClient
    , resolver: createBidirectionalResolver baseIdResolver
    , baseIdResolver
    , kv
    , db: pools.db
    , readDb: pools.readDb
    , pools
    , nc
    , analytics
    , dropbox
    , googledrive
    , tracklist
    , matching
    , musicbrainz
    , deezer
    , discogs
    , redis
    , typesense
    , authVerifier: authVerifier pools.db
    , sqliteDb
    , sqliteKv
    , lexiconDocs
    , lexicons: Lexicon.create lexiconDocs
    , metrics
    }
