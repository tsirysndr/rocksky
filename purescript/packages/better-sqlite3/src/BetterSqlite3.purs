-- | Bindings for `better-sqlite3`: open a file, run pragmas and statements.
module BetterSqlite3
  ( Database
  , open
  , pragma
  , exec
  , close
  ) where

import Prelude
import Effect (Effect)

foreign import data Database :: Type

-- | `new Database(location)`; the file is created when missing.
foreign import open :: String -> Effect Database

-- | `db.pragma("journal_mode = WAL")`.
foreign import pragma :: Database -> String -> Effect Unit

foreign import exec :: Database -> String -> Effect Unit

foreign import close :: Database -> Effect Unit
