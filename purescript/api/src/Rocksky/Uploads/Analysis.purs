module Rocksky.Uploads.Analysis (loadAnalysisModule, storeTrackAnalysis, analyzeUploadAudio) where

import Prelude
import Consola as Log
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isNothing)
import Data.Nullable (Nullable, toMaybe)
import Data.Number.Format (fixed, toStringWith)
import Drizzle.Builder (runUpdate, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Effect.Unsafe (unsafePerformEffect)
import Node.Buffer (Buffer)
import Rocksky.Analysis as Analysis
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Schema as T

analysisModule :: Ref.Ref (Maybe (Maybe Analysis.Module))
analysisModule = unsafePerformEffect (Ref.new Nothing)

loadAnalysisModule :: Aff (Maybe Analysis.Module)
loadAnalysisModule = do
  cached <- liftEffect (Ref.read analysisModule)
  case cached of
    Just value -> pure value
    Nothing -> do
      loaded <- attempt Analysis.loadChecked
      case loaded of
        Right value -> do
          liftEffect (Ref.write (Just (Just value)) analysisModule)
          pure (Just value)
        Left e -> do
          liftEffect do
            Ref.write (Just Nothing) analysisModule
            Log.warnF "[analysis] @rocksky/analysis native binding unavailable — key/bpm analysis disabled. Build it with `bun run build` in crates/analysis-node." [errorToForeign e]
          pure Nothing

storeTrackAnalysis :: Context -> String -> Nullable String -> Nullable Number -> Nullable String -> Aff Unit
storeTrackAnalysis ctx trackId key bpm fingerprint =
  unless (isNothing (toMaybe key) && isNothing (toMaybe bpm) && isNothing (toMaybe fingerprint)) do
    runUpdate ctx.db (updateForeign T.tracks (toForeign
      { key: SQL.coalesce (toSQL T.tracksC.key) (SQL.param key)
      , bpm: SQL.coalesce (toSQL T.tracksC.bpm) (SQL.param bpm)
      , acoustidFingerprint: SQL.coalesce (toSQL T.tracksC.acoustidFingerprint) (SQL.param fingerprint) })
      # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string trackId)))

analyzeUploadAudio :: Context -> Buffer -> String -> String -> Aff Unit
analyzeUploadAudio ctx buf extensionHint trackId = do
  result <- attempt do
    analysis <- loadAnalysisModule
    case analysis of
      Nothing -> pure unit
      Just module_ -> do
        started <- liftEffect (Date.getTime <$> Date.now)
        output <- Analysis.analyze module_ buf (Just extensionHint)
        storeTrackAnalysis ctx trackId output.key output.bpm output.fingerprint
        finished <- liftEffect (Date.getTime <$> Date.now)
        let decimal = toStringWith (fixed 1)
        liftEffect (Log.info ("[analysis] track " <> trackId <> ": key=" <> fromMaybe "?" (toMaybe output.key)
          <> " bpm=" <> fromMaybe "?" (decimal <$> toMaybe output.bpm)
          <> " fingerprint=" <> (if fromMaybe "" (toMaybe output.fingerprint) /= "" then "yes" else "no")
          <> " (" <> decimal ((finished - started) / 1000.0) <> "s)"))
  case result of
    Left e -> liftEffect (Log.warnF ("[analysis] track " <> trackId <> " failed:") [errorToForeign e])
    Right _ -> pure unit
