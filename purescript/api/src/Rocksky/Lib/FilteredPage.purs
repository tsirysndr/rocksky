-- | Choose between filtering first and walking the recent index. PostgreSQL's
-- | LIMIT plan assumes matches are spread evenly in time; older/rare artists
-- | violate that assumption and cause a full recent-index scan. Materializing
-- | selective matches removes that path, while broad predicates retain fast
-- | recent-index pagination. EXPLAIN only plans; it does not execute the search.
-- | Candidates must project `id` and `created_at` explicitly.
module Rocksky.Lib.FilteredPage (filteredPage) where

import Prelude

import Data.Array (head, mapMaybe)
import Data.Maybe (Maybe(..))
import Drizzle.Database (Database, executeRows)
import Drizzle.Dialect (Postgres)
import Drizzle.SQL (SQL, int, template)
import Effect.Aff (Aff)
import Rocksky.Lib.Foreign (readNumberAt, readStringAt)

filteredPage :: Database Postgres -> SQL -> Int -> Int -> Aff (Array String)
filteredPage db candidates limit offset = do
  explained <- executeRows db (template [ "EXPLAIN (FORMAT JSON) ", "" ] [ candidates ])
  let
    planRows = head explained >>= readNumberAt "QUERY PLAN.0.Plan.Plan Rows"
    selective = case planRows of
      Nothing -> true
      Just n -> n <= 10000.0
    page =
      if selective then
        template
          [ "WITH matches AS MATERIALIZED (", ") SELECT id FROM matches ORDER BY created_at DESC, id LIMIT ", " OFFSET ", "" ]
          [ candidates, int limit, int offset ]
      else
        template
          [ "SELECT id FROM (", ") matches ORDER BY created_at DESC, id LIMIT ", " OFFSET ", "" ]
          [ candidates, int limit, int offset ]
  rows <- executeRows db page
  pure (mapMaybe (readStringAt "id") rows)
