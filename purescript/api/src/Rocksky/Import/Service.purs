module Rocksky.Import.Service where

import Prelude
import Atproto.Api (Agent)
import Consola as Log
import Control.Parallel (parTraverse)
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldl, traverse_)
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable as N
import Data.Number (floor)
import Data.Set as Set
import Drizzle.Builder (limit, run, runUpdate, selectFieldsFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Foreign (toForeign, stringify, mergeForeign)
import Rocksky.Nowplaying.Service as Scrobble
import Rocksky.Schema as T
import Rocksky.Types.Track (Track)

type State = { cancelled :: Ref.Ref (Set.Set String), current :: Ref.Ref (Map.Map String String) }

newState :: Effect State
newState = { cancelled: _, current: _ } <$> Ref.new Set.empty <*> Ref.new Map.empty

patchJob :: Context -> String -> Foreign -> Aff Unit
patchJob ctx id fields = do
  now <- liftEffect Date.now
  runUpdate ctx.db (updateForeign T.importJobs (mergeForeign fields (toForeign { updatedAt: now }))
    # where_ (SQL.eq (toSQL T.importJobsC.id) (SQL.string id)))

type Dependencies =
  { agent :: String -> Aff (Maybe Agent)
  , scrobble :: Track -> Agent -> String -> Scrobble.ImportCache -> Aff Unit
  , pause :: Aff Unit
  }

runImport :: Context -> State -> String -> Array Track -> String -> Aff Unit
runImport ctx = runWith ctx
  { agent: createAgent ctx
  , scrobble: \track agent did cache -> Scrobble.scrobbleTrack ctx track agent did true (Just cache) Nothing
  , pause: sleep 300
  }

runWith :: Context -> Dependencies -> State -> String -> Array Track -> String -> Aff Unit
runWith ctx deps state jobId input did = deps.agent did >>= case _ of
  Nothing -> patchJob ctx jobId (toForeign
    { status: "failed", errors: stringify (toForeign ["Authentication failed: ATProto session not found or expired. Try scrobbling a track first to refresh your session."]) })
  Just agent -> do
    tracks <- prefilter ctx jobId input did
    cache <- liftEffect Scrobble.newImportCache
    let
      cancelled = liftEffect (Set.member jobId <$> Ref.read state.cancelled)
      cleanup = liftEffect do
        Ref.modify_ (Set.delete jobId) state.cancelled
        Ref.modify_ (Map.delete jobId) state.current
      stop processed = cleanup *> liftEffect (Log.info ("[import] Job " <> jobId <> " cancelled after " <> show processed <> " scrobbles"))
      progress processed failed errors = toForeign
        { processed, failed, errors: if A.null errors then N.null else N.notNull (stringify (toForeign errors)) }
      loop i processed failed errors = do
        if i >= A.length tracks then do
          liftEffect (Ref.modify_ (Map.delete jobId) state.current)
          patchJob ctx jobId (mergeForeign (progress processed failed errors) (toForeign { status: "completed" }))
          liftEffect (Log.info ("[import] Job " <> jobId <> " done: " <> show processed <> " ok, " <> show failed <> " failed out of " <> show (A.length tracks)))
        else do
          isCancelled <- cancelled
          if isCancelled then stop processed else do
            let batch = A.slice i (i + 3) tracks
            liftEffect (traverse_ (\t -> Ref.modify_ (Map.insert jobId (t.title <> " — " <> t.artist)) state.current) (A.head batch))
            results <- parTraverse (\track -> do
              result <- attempt (deps.scrobble track agent did cache)
              case result of
                Right _ -> pure Nothing
                Left e -> do
                  liftEffect (Log.warn ("[import] Failed scrobble \"" <> track.title <> "\": " <> message e))
                  pure (Just (track.title <> " - " <> track.artist <> ": " <> message e))) batch
            let
              failures = A.catMaybes results
              processed' = processed + A.length batch - A.length failures
              failed' = failed + A.length failures
              errors' = A.take 50 (errors <> failures)
            patchJob ctx jobId (progress processed' failed' errors')
            dbCancelled <- if (i / 3) `mod` 5 == 0 then do
              rows :: Array { status :: String } <- run ctx.db (selectFieldsFrom { status: toSQL T.importJobsC.status } T.importJobs
                # where_ (SQL.eq (toSQL T.importJobsC.id) (SQL.string jobId)) # limit 1)
              local <- cancelled
              pure (map _.status (A.head rows) == Just "cancelled" || local)
              else pure false
            if dbCancelled then stop processed' else do
              when (i + 3 < A.length tracks) deps.pause
              loop (i + 3) processed' failed' errors'
    loop 0 0 0 []

prefilter :: Context -> String -> Array Track -> String -> Aff (Array Track)
prefilter ctx jobId tracks did = do
  users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users
    # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
  let timestamps = A.filter (_ > 0.0) (map (fromMaybe 0.0 <<< N.toMaybe <<< _.timestamp) tracks)
  case A.head users, A.head timestamps of
    Just user, Just first -> do
      let
        minTs = Date.fromTime (foldl min first timestamps * 1000.0)
        maxTs = Date.fromTime (foldl max first timestamps * 1000.0)
      existing :: Array { timestamp :: Date.JSDate } <- run ctx.db
        (selectFieldsFrom { timestamp: toSQL T.scrobblesC.timestamp } T.scrobbles
          # where_ (SQL.and (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id))
              (SQL.and (SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.param minTs)) (SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.param maxTs)))))
      let
        seen = Set.fromFoldable (map (floor <<< (_ / 1000.0) <<< Date.getTime <<< _.timestamp) existing)
        remaining = A.filter (\t -> not (Set.member (fromMaybe 0.0 (N.toMaybe t.timestamp)) seen)) tracks
        skipped = A.length tracks - A.length remaining
      when (skipped > 0) do
        liftEffect (Log.info ("[import] Pre-filtered " <> show skipped <> " already-imported scrobbles, " <> show (A.length remaining) <> " remaining"))
        patchJob ctx jobId (toForeign { total: A.length remaining })
      pure remaining
    _, _ -> pure tracks
