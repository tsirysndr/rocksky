-- | Bindings for `pg` (node-postgres): pools, clients and raw queries, plus
-- | the bridge to a drizzle `Database Postgres` over a pool or client.
module Pg
  ( Pool
  , PoolClient
  , PoolConfig
  , defaultPoolConfig
  , createPool
  , connect
  , release
  , releaseDestroy
  , query
  , queryParams
  , clientQuery
  , clientQueryParams
  , QueryResult
  , onPoolError
  , onPoolConnect
  , onClientError
  , processID
  , end
  , drizzleFromPool
  , drizzleFromClient
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn2, mkEffectFn1, runEffectFn2)
import Foreign (Foreign)

foreign import data Pool :: Type
foreign import data PoolClient :: Type

type PoolConfig =
  { connectionString :: String
  , max :: Int
  , idleTimeoutMillis :: Int
  , connectionTimeoutMillis :: Int
  , application_name :: String
  , statement_timeout :: Int
  , idle_in_transaction_session_timeout :: Int
  }

defaultPoolConfig :: String -> PoolConfig
defaultPoolConfig connectionString =
  { connectionString
  , max: 10
  , idleTimeoutMillis: 30000
  , connectionTimeoutMillis: 5000
  , application_name: "purescript"
  , statement_timeout: 0
  , idle_in_transaction_session_timeout: 0
  }

foreign import createPool :: PoolConfig -> Effect Pool

foreign import connectImpl :: Pool -> Effect (Promise PoolClient)

connect :: Pool -> Aff PoolClient
connect p = toAffE (connectImpl p)

-- | `client.release()`.
foreign import release :: PoolClient -> Effect Unit

-- | `client.release(true)`: discard the connection instead of pooling it.
foreign import releaseDestroy :: PoolClient -> Effect Unit

type QueryResult = { rows :: Array Foreign, rowCount :: Nullable Int }

foreign import queryImpl :: EffectFn2 Pool String (Promise QueryResult)
foreign import queryParamsImpl :: Pool -> String -> Array Foreign -> Effect (Promise QueryResult)
foreign import clientQueryImpl :: EffectFn2 PoolClient String (Promise QueryResult)
foreign import clientQueryParamsImpl :: PoolClient -> String -> Array Foreign -> Effect (Promise QueryResult)

query :: Pool -> String -> Aff QueryResult
query p s = toAffE (runEffectFn2 queryImpl p s)

queryParams :: Pool -> String -> Array Foreign -> Aff QueryResult
queryParams p s xs = toAffE (queryParamsImpl p s xs)

clientQuery :: PoolClient -> String -> Aff QueryResult
clientQuery c s = toAffE (runEffectFn2 clientQueryImpl c s)

clientQueryParams :: PoolClient -> String -> Array Foreign -> Aff QueryResult
clientQueryParams c s xs = toAffE (clientQueryParamsImpl c s xs)

foreign import onPoolErrorImpl :: EffectFn2 Pool (EffectFn1 Foreign Unit) Unit
foreign import onPoolConnectImpl :: EffectFn2 Pool (EffectFn1 PoolClient Unit) Unit
foreign import onClientErrorImpl :: EffectFn2 PoolClient (EffectFn1 Foreign Unit) Unit

onPoolError :: Pool -> (Foreign -> Effect Unit) -> Effect Unit
onPoolError p f = runEffectFn2 onPoolErrorImpl p (mkEffectFn1 f)

onPoolConnect :: Pool -> (PoolClient -> Effect Unit) -> Effect Unit
onPoolConnect p f = runEffectFn2 onPoolConnectImpl p (mkEffectFn1 f)

onClientError :: PoolClient -> (Foreign -> Effect Unit) -> Effect Unit
onClientError c f = runEffectFn2 onClientErrorImpl c (mkEffectFn1 f)

foreign import processIDImpl :: PoolClient -> Nullable Int

-- | The backend pid, for `pg_cancel_backend`.
processID :: PoolClient -> Maybe Int
processID = toMaybe <<< processIDImpl

foreign import endImpl :: Pool -> Effect (Promise Unit)

end :: Pool -> Aff Unit
end p = toAffE (endImpl p)

-- | `drizzle(pool)` from `drizzle-orm/node-postgres`.
foreign import drizzleFromPool :: Pool -> Effect (Database Postgres)

-- | `drizzle(client)`: a database bound to one checked-out client.
foreign import drizzleFromClient :: PoolClient -> Effect (Database Postgres)
