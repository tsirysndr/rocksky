-- | `AbortSignal` plumbing for the metadata providers: the enrichment budget
-- | itself (`src/lib/enrichmentBudget.ts`) plus the helpers Matching, Discogs
-- | and SpotifyGet need to honour a signal from `Aff`.
module Rocksky.Lib.EnrichmentBudget
  ( enrichmentSignal
  , enrichmentSignalWith
  , anySignal
  , abortedSignal
  , isAborted
  , abortReason
  , throwIfAborted
  , awaitAbort
  , withAbort
  , sleepAbortable
  , isAbortError
  , AbortController
  , newAbortController
  , controllerSignal
  , abortController
  ) where

import Prelude

import Control.Parallel (parOneOf)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, Error, effectCanceler, makeAff, throwError)
import Effect.Class (liftEffect)
import Fetch (AbortSignal)
import Fetch as Fetch
import Rocksky.Lib.Aff (sleep)

foreign import anySignalImpl :: Array AbortSignal -> Effect AbortSignal

-- | `AbortSignal.any(signals)`.
anySignal :: Array AbortSignal -> Effect AbortSignal
anySignal = anySignalImpl

-- | matchSong has a ten-second response deadline. Optional metadata must stop
-- | earlier so a provider timeout does not discard a song we already found.
enrichmentSignal :: AbortSignal -> Effect AbortSignal
enrichmentSignal parent = enrichmentSignalWith parent 8000

enrichmentSignalWith :: AbortSignal -> Int -> Effect AbortSignal
enrichmentSignalWith parent timeoutMs = do
  t <- Fetch.timeoutSignal timeoutMs
  anySignal [ parent, t ]

-- | `AbortSignal.abort()`: an already-aborted signal.
foreign import abortedSignal :: Effect AbortSignal

foreign import isAborted :: AbortSignal -> Effect Boolean

-- | `signal.reason`, as an `Error`.
foreign import abortReason :: AbortSignal -> Effect Error

-- | `signal.throwIfAborted()`.
throwIfAborted :: AbortSignal -> Aff Unit
throwIfAborted s = do
  aborted <- liftEffect (isAborted s)
  when aborted (liftEffect (abortReason s) >>= throwError)

foreign import onAbortImpl :: AbortSignal -> (Error -> Effect Unit) -> Effect (Effect Unit)

-- | Resolves with the abort reason once the signal fires (immediately when it
-- | already has).
awaitAbort :: AbortSignal -> Aff Error
awaitAbort s = makeAff \k -> do
  remove <- onAbortImpl s (k <<< Right)
  pure (effectCanceler remove)

-- | Run an action, failing with the signal's reason (and killing the action)
-- | as soon as the signal aborts. `Nothing` runs the action unguarded.
withAbort :: forall a. Maybe AbortSignal -> Aff a -> Aff a
withAbort Nothing act = act
withAbort (Just s) act = do
  r <- parOneOf [ Right <$> act, Left <$> awaitAbort s ]
  case r of
    Right a -> pure a
    Left e -> throwError e

-- | `setTimeout(ms, undefined, { signal })`: a sleep the signal can cut short.
sleepAbortable :: Int -> Maybe AbortSignal -> Aff Unit
sleepAbortable ms signal = withAbort signal (sleep ms)

-- | `error.name` is "AbortError" or "TimeoutError".
foreign import isAbortError :: Error -> Boolean

foreign import data AbortController :: Type

foreign import newAbortController :: Effect AbortController
foreign import controllerSignal :: AbortController -> AbortSignal
foreign import abortController :: AbortController -> Effect Unit
