-- | app.rocksky.stats.getGlobalStats
module Rocksky.Xrpc.App.Rocksky.Stats.GetGlobalStats (register, GlobalStats) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parSequence)
import Data.Array (head)
import Data.Either (either)
import Data.Maybe (Maybe(..), fromMaybe)
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.SQL as SQL
import Drizzle.Schema (Table)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T

type GlobalStats = { scrobbles :: Number, users :: Number, artists :: Number, albums :: Number, tracks :: Number }

defaultStats :: GlobalStats
defaultStats = { scrobbles: 0.0, users: 0.0, artists: 0.0, albums: 0.0, tracks: 0.0 }

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.stats.getGlobalStats"
    { auth: Nothing
    , handler: \_ -> do
        -- The TS fallback swallows the error without logging it.
        result <- either (const defaultStats) identity <$> attempt (timeoutMs 120000 (retryTransientDb (retrieve ctx)))
        pure (Json (toForeign result))
    }

retrieve :: Context -> Aff GlobalStats
retrieve ctx = do
  counts <- parSequence
    [ countRows T.scrobbles
    , countRows T.users
    , countRows T.artists
    , countRows T.albums
    , countRows T.tracks
    ]
  case counts of
    [ scrobbles, users, artists, albums, tracks ] -> pure { scrobbles, users, artists, albums, tracks }
    _ -> pure defaultStats
  where
  countRows :: forall cols. Table Postgres cols -> Aff Number
  countRows t = do
    rows :: Array { n :: Number } <- run (ctx.readDb :: Database Postgres) (selectFieldsFrom { n: SQL.count } t)
    pure (fromMaybe 0.0 (_.n <$> head rows))
