-- | Effect.Cache semantics needed by recommendations: bounded LRU, shared
-- | in-flight lookup, and both successful and failed results retained until TTL.
module Rocksky.Lib.ResultCache (create, createWithClock) where

import Prelude
import Data.Array as A
import Data.Either (Either, either)
import Data.Int (toNumber)
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, Error, attempt, generalBracket, throwError)
import Effect.Aff.AVar as AVar
import Effect.AVar (AVar)
import Effect.AVar as Sync
import Effect.Class (liftEffect)
import Effect.Ref as Ref

type Completed a = { result :: Either Error a, expiresAt :: Number }
data Value a = Pending (AVar (Completed a)) | Complete (Completed a)
type Entry a = { generation :: Int, value :: Value a }

create :: forall a. Int -> Int -> (String -> Aff a) -> Effect (String -> Aff a)
create = createWithClock (Date.getTime <$> Date.now)

createWithClock :: forall a. Effect Number -> Int -> Int -> (String -> Aff a) -> Effect (String -> Aff a)
createWithClock now ttl capacity lookup = do
  state <- Ref.new { entries: Map.empty :: Map.Map String (Entry a), order: [] :: Array String, next: 0 }
  let touch key s = s { order = A.snoc (A.filter (_ /= key) s.order) key }
  let evict s = if A.length s.order <= capacity then s else case A.uncons s.order of
        Nothing -> s
        Just { head, tail } -> evict (s { entries = Map.delete head s.entries, order = tail })
  pure \key -> generalBracket (liftEffect do
      time <- now
      old <- Ref.read state
      let s = touch key old
      case Map.lookup key s.entries of
        Just entry@{ value: Complete value } | time <= value.expiresAt -> do
          Ref.write s state
          pure { entry, fresh: false }
        Just entry@{ value: Pending _ } -> do
          Ref.write s state
          pure { entry, fresh: false }
        _ -> do
          pending <- Sync.empty
          let entry = { generation: s.next, value: Pending pending }
          Ref.write (evict (s { next = s.next + 1, entries = Map.insert key entry s.entries })) state
          pure { entry, fresh: true })
    { killed: \e claim -> when claim.fresh do
        liftEffect (Ref.modify_ (\s -> s { entries = Map.delete key s.entries, order = A.filter (_ /= key) s.order }) state)
        case claim.entry.value of
          Pending pending -> AVar.kill e pending
          Complete _ -> pure unit
    , failed: \_ _ -> pure unit
    , completed: \_ _ -> pure unit
    } \claim -> do
      case claim.entry.value of
        Complete value -> either throwError pure value.result
        Pending pending -> if not claim.fresh then do
          value <- AVar.read pending
          either throwError pure value.result
        else do
          result <- attempt (lookup key)
          completed <- liftEffect now
          let value = { result, expiresAt: completed + toNumber ttl }
          -- Effect.Cache completes even an entry evicted while it was pending.
          liftEffect (Ref.modify_ (\s -> s { entries = Map.insert key (claim.entry { value = Complete value }) s.entries }) state)
          AVar.put value pending
          either throwError pure value.result
