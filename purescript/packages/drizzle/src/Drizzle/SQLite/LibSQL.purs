-- | Driver: libSQL, for local files and Turso. Requires the `@libsql/client`
-- | npm package.
module Drizzle.SQLite.LibSQL
  ( Config
  , open
  , close
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toNullable)
import Drizzle.Database (Database)
import Drizzle.Dialect (SQLite)
import Effect (Effect)
import Effect.Aff (Aff)

-- | `url` is `":memory:"`, `"file:local.db"` or a `libsql://` Turso URL;
-- | `authToken` is needed for Turso.
type Config = { url :: String, authToken :: Maybe String }

foreign import openImpl :: { url :: String, authToken :: Nullable String } -> Effect (Database SQLite)
foreign import closeImpl :: Database SQLite -> Effect (Promise Unit)

open :: Config -> Effect (Database SQLite)
open cfg = openImpl { url: cfg.url, authToken: toNullable cfg.authToken }

close :: Database SQLite -> Aff Unit
close db = toAffE (closeImpl db)
