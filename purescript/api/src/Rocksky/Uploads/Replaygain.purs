-- | Upload-time ReplayGain tagging (`src/uploads/replaygain.ts`).
-- |
-- | The desktop/wasm players apply ReplayGain from tags embedded in the audio
-- | file (the rockbox engine reads them from the stream header) — files without
-- | tags play at full mastered loudness no matter what the user's ReplayGain
-- | setting is. Most store-bought/ripped files ship untagged, so we analyze the
-- | track with ffmpeg's `replaygain` filter and write the standard
-- | REPLAYGAIN_TRACK_GAIN / REPLAYGAIN_TRACK_PEAK tags before the file is
-- | stored:
-- |   - m4a → iTunes freeform atoms (----:com.apple.iTunes:REPLAYGAIN_*)
-- |   - mp3 → ID3v2 TXXX frames
-- |   - flac/ogg → vorbis comments
-- | all via node-taglib-sharp, all formats the rockbox metadata parser reads.
-- |
-- | Any failure (no ffmpeg on the host, undecodable audio, unsupported
-- | container) degrades to storing the file as-is.
module Rocksky.Uploads.Replaygain
  ( replaygainExts
  , TrackGain
  , analyzeTrackGain
  , writeTrackGain
  , ensureReplayGain
  ) where

import Prelude

import Consola as Consola
import Control.Promise (Promise, toAffE)
import Data.Array (elem)
import Data.Array.NonEmpty as NEA
import Data.Either (Either(..), hush)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
import Data.Number.Format (fixed, toStringWith)
import Data.String.Regex (match, regex)
import Data.String.Regex.Flags (noFlags)
import Effect (Effect)
import Effect.Aff (Aff, attempt, finally)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Node.Buffer (Buffer)
import Node.FS.Aff as FS
import Node.Path as Path
import Node.Process (lookupEnv)
import NodeTaglibSharp as Taglib
import Rocksky.Lib.Error (errorToForeign)

foreign import tmpdirImpl :: Effect String
foreign import runFfmpegImpl :: String -> Array String -> Int -> Effect (Promise { code :: Nullable Int, stderr :: String })

analysisTimeoutMs :: Int
analysisTimeoutMs = 120000

-- | Extensions taglib can write RG tags to and rockbox can read them from.
replaygainExts :: Array String
replaygainExts = [ "mp3", "flac", "m4a", "ogg" ]

type TrackGain = { gainDb :: Number, peak :: Number }

-- | Decode the file and measure ReplayGain 1.0 track gain/peak.
analyzeTrackGain :: String -> Aff (Maybe TrackGain)
analyzeTrackGain path = do
  ffmpeg <- liftEffect (fromMaybe "ffmpeg" <$> lookupEnv "FFMPEG_PATH")
  { code, stderr } <- toAffE $ runFfmpegImpl ffmpeg
    [ "-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "replaygain", "-f", "null", "-" ]
    analysisTimeoutMs
  pure case toMaybe code of
    Just 0 -> do
      gain <- capture "track_gain\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?)\\s*dB" stderr
      peak <- capture "track_peak\\s*=\\s*(\\d+(?:\\.\\d+)?)" stderr
      gainDb <- Number.fromString gain
      p <- Number.fromString peak
      pure { gainDb, peak: p }
    _ -> Nothing
  where
  capture pat s = do
    re <- hush (regex pat noFlags)
    ms <- match re s
    join (NEA.index ms 1)

-- | Write RG track tags into the file at `path` (in place).
writeTrackGain :: String -> TrackGain -> Effect Unit
writeTrackGain path rg = Taglib.withFile path \f -> do
  Taglib.setReplayGainTrackGain f rg.gainDb
  Taglib.setReplayGainTrackPeak f rg.peak
  Taglib.save f

-- | Return `buf` with ReplayGain track tags added, or `buf` unchanged when the
-- | format is unsupported or analysis/tagging fails.
ensureReplayGain :: Buffer -> String -> Aff Buffer
ensureReplayGain buf ext
  | not (elem ext replaygainExts) = pure buf
  | otherwise = do
      dirRef <- liftEffect (Ref.new Nothing)
      finally (cleanup dirRef) do
        r <- attempt do
          tmp <- liftEffect tmpdirImpl
          dir <- FS.mkdtemp (Path.concat [ tmp, "rocksky-rg-" ])
          liftEffect (Ref.write (Just dir) dirRef)
          let path = Path.concat [ dir, "audio." <> ext ]
          FS.writeFile path buf
          analyzeTrackGain path >>= case _ of
            Nothing -> do
              liftEffect (Consola.warn "[uploads] replaygain analysis failed, storing untagged")
              pure buf
            Just rg -> do
              liftEffect (writeTrackGain path rg)
              tagged <- FS.readFile path
              liftEffect $ Consola.info
                ( "[uploads] replaygain tagged: " <> toStringWith (fixed 2) rg.gainDb
                    <> " dB, peak "
                    <> toStringWith (fixed 6) rg.peak
                )
              pure tagged
        case r of
          Right b -> pure b
          Left e -> do
            liftEffect (Consola.warnF "[uploads] replaygain tagging failed, storing untagged" [ errorToForeign e ])
            pure buf
  where
  cleanup dirRef = do
    d <- liftEffect (Ref.read dirRef)
    case d of
      Nothing -> pure unit
      Just dir -> void (attempt (FS.rm' dir { force: true, maxRetries: 0, recursive: true, retryDelay: 100 }))
