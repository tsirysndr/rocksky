-- | Fold loved-track counts into a list of tracks (`src/lib/trackLikes.ts`).
-- | `liked` is false without a DID, so an unauthenticated caller still gets
-- | the counts. Matching is by sha256, not by row id: the same song can exist
-- | as several `tracks` rows, and the like landed on one of them.
module Rocksky.Lib.TrackLikes (withLikes) where

import Prelude

import Data.Array (filter, find, length, mapMaybe, nub, null)
import Data.Map as Map
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (innerJoin, leftJoin, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Record as Record
import Rocksky.Context (Context)
import Rocksky.Schema as T
import Type.Proxy (Proxy(..))
import Data.Tuple (Tuple(..))
import Prim.Row (class Lacks)

withLikes
  :: forall r
   . Lacks "likesCount" r
  => Lacks "liked" r
  => Context
  -> Array (Record r)
  -> Maybe String
  -> (Record r -> Maybe String)
  -> Aff (Array { likesCount :: Int, liked :: Boolean | r })
withLikes ctx rows did selectId = do
  let trackIds = mapMaybe selectId rows
  if null trackIds then pure []
  else do
    identities :: Array { id :: String, sha256 :: String } <- run ctx.db
      ( selectFieldsFrom { id: toSQL T.tracksC.id, sha256: toSQL T.tracksC.sha256 } T.tracks
          # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string trackIds))
      )
    let
      shaById = Map.fromFoldable (map (\t -> Tuple t.id t.sha256) identities)
      shas = nub (filter (_ /= "") (map _.sha256 identities))
    if null shas then pure (map (decorate 0 false) rows)
    else do
      likes :: Array { sha256 :: String, did :: Nullable String } <- run ctx.db
        ( selectFieldsFrom { sha256: toSQL T.tracksC.sha256, did: toSQL T.usersC.did } T.lovedTracks
            # innerJoin T.tracks (SQL.eq (toSQL T.lovedTracksC.trackId) (toSQL T.tracksC.id))
            # leftJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
            # where_ (SQL.inArray (toSQL T.tracksC.sha256) (map SQL.string shas))
        )
      pure $ rows <#> \row ->
        let
          forTrack = case selectId row >>= \id -> Map.lookup id shaById of
            Just sha -> filter (\l -> l.sha256 == sha) likes
            Nothing -> []
          liked = isJust did && isJust (find (\l -> toMaybe l.did == did) forTrack)
        in
          decorate (length forTrack) liked row
  where
  decorate n liked row = Record.insert (Proxy :: Proxy "liked") liked (Record.insert (Proxy :: Proxy "likesCount") n row)
