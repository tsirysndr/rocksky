module Rocksky.Cli.Import.Checkpoint where

import Prelude
import Data.Array as Array
import Data.Maybe (fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Set as Set
import Effect (Effect)
import Effect.Ref as Ref
import Rocksky.Lib.Foreign as F

type ScrobbleId = { timestamp :: Number, title :: String, artist :: String }
type Cursor = { timestamp :: Number, title :: String, artist :: String, count :: Int }
type Checkpoint = { source :: String, format :: String, cursor :: Nullable Cursor, completed :: Nullable (Array ScrobbleId), updatedAt :: String }
type State = { mark :: Int, done :: Set.Set Int }
type Tracker = Ref.Ref State

sameId :: forall r s. { timestamp :: Number, title :: String, artist :: String | r } -> { timestamp :: Number, title :: String, artist :: String | s } -> Boolean
sameId a b = a.timestamp == b.timestamp && a.title == b.title && a.artist == b.artist

resumeIndex :: forall r. Array ScrobbleId -> Nullable { timestamp :: Number, title :: String, artist :: String | r } -> Int
resumeIndex list cursor = fromMaybe 0 do
  value <- toMaybe cursor
  i <- Array.findIndex (\item -> sameId item value) list
  pure (i + 1)

newTracker :: Effect Tracker
newTracker = Ref.new { mark: -1, done: Set.empty }

complete :: Tracker -> Int -> Effect Boolean
complete tracker i = do
  state <- Ref.read tracker
  if i <= state.mark then pure false
  else do
    let next = advance (state { done = Set.insert i state.done })
    Ref.write next tracker
    pure (next.mark > state.mark)
  where
  advance state =
    if Set.member (state.mark + 1) state.done then
      advance { mark: state.mark + 1, done: Set.delete (state.mark + 1) state.done }
    else state

mark :: Tracker -> Effect Int
mark tracker = _.mark <$> Ref.read tracker

outstanding :: Tracker -> Effect (Array Int)
outstanding tracker = Set.toUnfoldable <<< _.done <$> Ref.read tracker

restoreProgress :: Array ScrobbleId -> Nullable Checkpoint -> Effect { tracker :: Tracker, pendingIndices :: Array Int }
restoreProgress list saved = do
  tracker <- newTracker
  let
    start = fromMaybe 0 (toMaybe saved <#> \cp -> resumeIndex list cp.cursor)
    successes = fromMaybe [] (toMaybe saved >>= \cp -> toMaybe cp.completed)
    key item = F.stringify (F.toForeign [ F.toForeign item.timestamp, F.toForeign item.title, F.toForeign item.artist ])
    completedKeys = Set.fromFoldable (map key successes)
    classify i item = { i, completed: i < start || Set.member (key item) completedKeys }
  pendingIndices <- Array.filterA (\entry -> if entry.completed then complete tracker entry.i *> pure false else pure true) (Array.mapWithIndex classify list)
  pure { tracker, pendingIndices: map _.i pendingIndices }
