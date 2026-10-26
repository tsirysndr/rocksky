module Rocksky.Lib.ScrobbleLikes (retrieve) where

import Prelude
import Data.Array as A
import Data.Maybe (Maybe(..))
import Drizzle.Builder (groupBy, leftJoin, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Rocksky.Context (Context)
import Rocksky.Schema as T

type Summary = { counts :: Array { trackId :: String, count :: Int }, liked :: Array { trackId :: String } }

retrieve :: Context -> Array String -> Maybe String -> Aff Summary
retrieve ctx ids did = if A.null ids then pure { counts: [], liked: [] } else do
  let base = selectFieldsFrom
        { trackId: toSQL T.lovedTracksC.trackId, count: SQL.count
        , liked: case did of
            Nothing -> SQL.bool false
            Just viewer -> SQL.template ["coalesce(bool_or(", " = ", "), false)"] [toSQL T.usersC.did, SQL.string viewer]
        } T.lovedTracks
      query = case did of
        Nothing -> base
        Just _ -> base # leftJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
  rows :: Array { trackId :: String, count :: Int, liked :: Boolean } <- run ctx.db
    (query # where_ (SQL.inArray (toSQL T.lovedTracksC.trackId) (map SQL.string ids)) # groupBy [toSQL T.lovedTracksC.trackId])
  pure { counts: map (\r -> { trackId: r.trackId, count: r.count }) rows, liked: map (\r -> { trackId: r.trackId }) (A.filter _.liked rows) }
