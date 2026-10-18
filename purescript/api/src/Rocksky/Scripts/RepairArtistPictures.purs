module Rocksky.Scripts.RepairArtistPictures (main) where

import Prelude
import Consola as Log
import Control.Promise (Promise, toAffE)
import Dotenv as Dotenv
import Effect (Effect)
import Effect.Aff (Aff, bracket)
import Effect.Class (liftEffect)
import Rocksky.Scripts.Common (runScript)

foreign import data Session :: Type

type Options = { help :: Boolean, dryRun :: Boolean, limit :: Int, batchSize :: Int }
type Counts = { scanned :: Int, matched :: Int, updated :: Int }
foreign import options :: Effect (Promise Options)
foreign import open :: Options -> Effect (Promise Session)
foreign import close :: Session -> Effect (Promise Unit)
foreign import batch :: Session -> Int -> Effect (Promise Counts)
foreign import help :: String

repair :: Options -> Session -> Counts -> Aff Unit
repair opts session counts = do
  let size = if opts.limit == 0 then opts.batchSize else min opts.batchSize (opts.limit - counts.scanned)
  if size <= 0 then finished
  else do
    result <- toAffE (batch session size)
    if result.scanned == 0 then finished
    else do
      let total = { scanned: counts.scanned + result.scanned, matched: counts.matched + result.matched, updated: counts.updated + result.updated }
      liftEffect (Log.info ("Scanned " <> show total.scanned <> "; pictures found " <> show total.matched <> "; updated " <> show total.updated))
      repair opts session total
  where
  finished = liftEffect (Log.success ("Artist picture repair finished: " <> show counts.updated <> " updated; " <> show (counts.scanned - counts.matched) <> " without a picture from Rocksky." <> if opts.dryRun then " Dry run: no writes." else ""))

main :: Effect Unit
main = runScript do
  liftEffect Dotenv.config
  opts <- toAffE options
  if opts.help then liftEffect (Log.info help)
  else bracket (toAffE (open opts)) (toAffE <<< close) \session ->
    repair opts session {scanned:0,matched:0,updated:0}
