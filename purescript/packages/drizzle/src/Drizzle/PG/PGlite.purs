-- | Driver: PGlite, an in-process Postgres. Requires the `@electric-sql/pglite`
-- | npm package.
module Drizzle.PG.PGlite
  ( open
  , close
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toNullable)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import openImpl :: Nullable String -> Effect (Database Postgres)
foreign import closeImpl :: Database Postgres -> Effect (Promise Unit)

-- | Open an in-memory database (`Nothing`) or one persisted in a directory.
open :: Maybe String -> Effect (Database Postgres)
open dir = openImpl (toNullable dir)

close :: Database Postgres -> Aff Unit
close db = toAffE (closeImpl db)
