-- | Driver: mysql2. Requires the `mysql2` npm package.
module Drizzle.MySQL.MySQL2
  ( connect
  , close
  , mock
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Drizzle.Database (Database)
import Drizzle.Dialect (MySQL)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import connectImpl :: String -> Effect (Database MySQL)
foreign import closeImpl :: Database MySQL -> Effect (Promise Unit)

-- | A database with no connection, for rendering queries with `toQuery`.
foreign import mock :: Effect (Database MySQL)

-- | Create a connection pool from a `mysql://user:pass@host/db` string.
connect :: String -> Effect (Database MySQL)
connect = connectImpl

close :: Database MySQL -> Aff Unit
close db = toAffE (closeImpl db)
