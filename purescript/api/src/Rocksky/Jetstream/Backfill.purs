-- | Archive ingestion uses the same payload and dedup identity as the Rust live subscriber.
module Rocksky.Jetstream.Backfill where

import Prelude
import Consola as Log
import Control.Promise (Promise, toAffE)
import Data.Array as A
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff, bracket)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Node.Crypto (sha256Hex)
import Rocksky.Lib.Foreign (stringify, toForeign)

foreign import data Session :: Type

type Options =
  { service :: String, apiKey :: String, database :: String
  , afterSeq :: Nullable Number, beforeSeq :: Nullable Number
  , batchSize :: Int, limit :: Nullable Number, dryRun :: Boolean, help :: Boolean
  }

type Event =
  { seq :: Number, did :: String, timeUs :: Number
  , rev :: String, operation :: String, collection :: String, rkey :: String
  , record :: Foreign, cid :: Nullable String
  }

type Job =
  { id :: String, requestHash :: String, payload :: String
  , collection :: String, actor :: String
  }

kind :: String
kind = "jetstream.commit.v1"

job :: Event -> Job
job event =
  let
    key = event.did <> "|" <> event.collection <> "|" <> event.rkey <> "|" <> event.rev
    payload = stringify (toForeign
      { did: event.did, time_us: event.timeUs, kind: "commit"
      , commit:
          { rev: event.rev, operation: event.operation, collection: event.collection
          , rkey: event.rkey, record: event.record, cid: event.cid
          }
      })
  in
    { id: sha256Hex (stringify (toForeign [kind, key]))
    , requestHash: sha256Hex payload, payload
    , collection: event.collection, actor: event.did
    }

foreign import options :: Effect Options
foreign import open :: Options -> Effect (Promise Session)
foreign import close :: Session -> Effect (Promise Unit)
foreign import next :: Session -> Int -> Effect (Promise (Array Event))
foreign import capture :: Session -> Array Job -> Number -> Effect (Promise Int)

-- | Pull only after the preceding database transaction committed. A failure leaves
-- | the durable checkpoint unchanged so the entire uncommitted batch is replayed.
backfill :: Options -> Aff Unit
backfill opts = bracket (toAffE (open opts)) (toAffE <<< close) \session -> do
  liftEffect (Log.info ("Backfilling app.rocksky.* from " <> opts.service))
  loop session 0.0 0.0
  where
  loop session scanned inserted = do
    let remaining = case toMaybe opts.limit of
          Nothing -> opts.batchSize
          Just n -> Int.floor (min (Int.toNumber opts.batchSize) (n - scanned))
    if remaining <= 0 then done scanned inserted
    else do
      events <- toAffE (next session remaining)
      case A.last events of
        Nothing -> done scanned inserted
        Just last -> do
          count <- if opts.dryRun then pure 0
            else toAffE (capture session (map job events) last.seq)
          let total = scanned + Int.toNumber (A.length events)
          let saved = inserted + Int.toNumber count
          liftEffect (Log.info ("Scanned " <> show total <> "; newly queued " <> show saved <> "; sequence " <> show last.seq))
          loop session total saved
  done scanned inserted = liftEffect (Log.success
    ("Archive scan finished: " <> show scanned <> " commits; " <> show inserted <> " newly queued."
      <> if opts.dryRun then " Dry run: no writes or checkpoints." else " The Jetstream worker indexes queued jobs."))
