-- | Bindings for `node-cron`.
module NodeCron (Task, schedule, stop) where

import Prelude

import Control.Promise (Promise, fromAff)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn2, runEffectFn2)

foreign import data Task :: Type

foreign import scheduleImpl :: EffectFn2 String (Effect (Promise Unit)) Task

-- | `cron.schedule(expression, async () => ...)`.
schedule :: String -> Aff Unit -> Effect Task
schedule expr job = runEffectFn2 scheduleImpl expr (fromAff job)

foreign import stop :: Task -> Effect Unit
