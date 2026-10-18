-- | Bindings for `@rocksky/analysis` (crates/analysis-node, Rust/Neon):
-- | key, BPM and AcoustID fingerprint of audio buffers.
-- |
-- | The module is loaded lazily with `load`, so the API still boots on a
-- | machine where the native binding has not been built.
module Rocksky.Analysis
  ( Module
  , load
  , loadChecked
  , AudioAnalysis
  , analyze
  , analyzeFile
  , supportsFingerprint
  , AnalyzeBatchItem
  , AnalyzeBatchProgress
  , AnalyzeBatchResult
  , analyzeBatch
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, mkEffectFn1)
import Node.Buffer (Buffer)

foreign import data Module :: Type

foreign import loadCheckedImpl :: Effect (Promise Module)

-- | Import the native module, preserving the import error for caller logging.
loadChecked :: Aff Module
loadChecked = toAffE loadCheckedImpl

foreign import loadImpl :: Effect (Promise (Nullable Module))

-- | `await import("@rocksky/analysis")`; `Nothing` when the native binding is
-- | not built (the import error is swallowed).
load :: Aff (Maybe Module)
load = toMaybe <$> toAffE loadImpl

-- | `duration` is seconds as decoded; confidences are 0–1; `fingerprint` is
-- | the base64url Chromaprint of the opening two minutes.
type AudioAnalysis =
  { bpm :: Nullable Number
  , bpmConfidence :: Nullable Number
  , key :: Nullable String
  , keyConfidence :: Nullable Number
  , fingerprint :: Nullable String
  , duration :: Number
  }

foreign import analyzeImpl :: Module -> Buffer -> Nullable String -> Effect (Promise AudioAnalysis)

-- | `analyze(buffer, extensionHint)`: one track on the libuv worker pool.
analyze :: Module -> Buffer -> Maybe String -> Aff AudioAnalysis
analyze m buf ext = toAffE (analyzeImpl m buf (toNullable ext))

foreign import analyzeFileImpl :: Module -> String -> Effect (Promise AudioAnalysis)

-- | `analyze(await readFile(path), extname(path))`.
analyzeFile :: Module -> String -> Aff AudioAnalysis
analyzeFile m path = toAffE (analyzeFileImpl m path)

-- | `"fingerprint" in analysis`: false for a binding built before
-- | fingerprinting existed (the field is then missing, not null).
foreign import supportsFingerprint :: AudioAnalysis -> Boolean

-- | `id` is echoed back in progress events and results.
type AnalyzeBatchItem =
  { id :: Nullable String
  , buffer :: Buffer
  , extensionHint :: Nullable String
  }

type AnalyzeBatchProgress =
  { id :: Nullable String
  , index :: Int
  , completed :: Int
  , total :: Int
  , ok :: Boolean
  , bpm :: Nullable Number
  , key :: Nullable String
  , fingerprint :: Boolean
  , error :: Nullable String
  }

type AnalyzeBatchResult =
  { id :: Nullable String
  , ok :: Boolean
  , analysis :: Nullable AudioAnalysis
  , error :: Nullable String
  }

foreign import analyzeBatchImpl
  :: Module
  -> Array AnalyzeBatchItem
  -> EffectFn1 AnalyzeBatchProgress Unit
  -> Effect (Promise (Array AnalyzeBatchResult))

-- | `analyzeBatch(items, onProgress)`: all cores, results in input order,
-- | `onProgress` fired per track in completion order.
analyzeBatch :: Module -> Array AnalyzeBatchItem -> (AnalyzeBatchProgress -> Effect Unit) -> Aff (Array AnalyzeBatchResult)
analyzeBatch m items onProgress = toAffE (analyzeBatchImpl m items (mkEffectFn1 onProgress))
