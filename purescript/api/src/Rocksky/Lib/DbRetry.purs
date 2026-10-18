module Rocksky.Lib.DbRetry (isTransientDbError) where

import Prelude

import Data.Array (any)
import Data.String (Pattern(..), contains, toLower)
import Effect.Aff (Error, message)

-- Errors that mean "the connection died under us": a fresh attempt on a new
-- pooled client is likely to work.
transient :: Array String
transient =
  [ "econnreset"
  , "epipe"
  , "connection terminated"
  , "connection ended unexpectedly"
  , "server closed the connection unexpectedly"
  , "client has encountered a connection error"
  , "terminating connection due to administrator command"
  ]

-- Errors that mean the database is already over capacity. Retrying these is
-- what turns a slow database into an outage: every retry is another connection
-- checkout queued behind the ones that are already stuck.
fatal :: Array String
fatal =
  [ "timeout exceeded when trying to connect"
  , "canceling statement due to statement timeout"
  , "canceling statement due to user request"
  , "too many clients already"
  , "remaining connection slots are reserved"
  ]

isTransientDbError :: Error -> Boolean
isTransientDbError err =
  let m = toLower (message err)
  in not (any (\n -> contains (Pattern n) m) fatal) && any (\n -> contains (Pattern n) m) transient
