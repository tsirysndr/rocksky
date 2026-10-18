-- | Bindings for `node-taglib-sharp`: open a file, read/write its tag
-- | (ReplayGain and the generic fields), save and dispose. All calls are
-- | synchronous in taglib, hence `Effect`.
module NodeTaglibSharp
  ( File
  , createFromPath
  , save
  , dispose
  , withFile
  , durationMs
  -- ReplayGain
  , getReplayGainTrackGain
  , setReplayGainTrackGain
  , getReplayGainTrackPeak
  , setReplayGainTrackPeak
  , getReplayGainAlbumGain
  , setReplayGainAlbumGain
  , getReplayGainAlbumPeak
  , setReplayGainAlbumPeak
  -- generic tags
  , getTitle
  , setTitle
  , getAlbum
  , setAlbum
  , getPerformers
  , setPerformers
  , getAlbumArtists
  , setAlbumArtists
  , getGenres
  , setGenres
  , getComposers
  , setComposers
  , getComment
  , setComment
  , getYear
  , setYear
  , getTrack
  , setTrack
  , getTrackCount
  , setTrackCount
  , getDisc
  , setDisc
  , getDiscCount
  , setDiscCount
  , getLyrics
  , setLyrics
  , getIsrc
  , setIsrc
  ) where

import Prelude

import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)

foreign import data File :: Type

-- | `File.createFromPath(path)`; throws for unsupported containers.
foreign import createFromPath :: String -> Effect File

-- | `file.save()` writes the tag back in place.
foreign import save :: File -> Effect Unit

-- | `file.dispose()` releases the file handle.
foreign import dispose :: File -> Effect Unit

-- | `createFromPath` + the action + `dispose` in a `finally`.
foreign import withFile :: forall a. String -> (File -> Effect a) -> Effect a

-- | `file.properties.durationMilliseconds`.
foreign import durationMs :: File -> Effect Number

foreign import getNumber :: String -> File -> Effect Number
foreign import setNumber :: String -> File -> Number -> Effect Unit
foreign import getStringImpl :: String -> File -> Effect (Nullable String)
foreign import setString :: String -> File -> String -> Effect Unit
foreign import getStrings :: String -> File -> Effect (Array String)
foreign import setStrings :: String -> File -> Array String -> Effect Unit
foreign import getInt :: String -> File -> Effect Int
foreign import setInt :: String -> File -> Int -> Effect Unit

getString :: String -> File -> Effect (Maybe String)
getString k f = toMaybe <$> getStringImpl k f

-- | `file.tag.replayGainTrackGain` (dB; NaN when the tag is absent).
getReplayGainTrackGain :: File -> Effect Number
getReplayGainTrackGain = getNumber "replayGainTrackGain"

-- | `file.tag.replayGainTrackGain = db` (m4a → iTunes freeform atom,
-- | mp3 → TXXX frame, flac/ogg → vorbis comment).
setReplayGainTrackGain :: File -> Number -> Effect Unit
setReplayGainTrackGain = setNumber "replayGainTrackGain"

getReplayGainTrackPeak :: File -> Effect Number
getReplayGainTrackPeak = getNumber "replayGainTrackPeak"

setReplayGainTrackPeak :: File -> Number -> Effect Unit
setReplayGainTrackPeak = setNumber "replayGainTrackPeak"

getReplayGainAlbumGain :: File -> Effect Number
getReplayGainAlbumGain = getNumber "replayGainAlbumGain"

setReplayGainAlbumGain :: File -> Number -> Effect Unit
setReplayGainAlbumGain = setNumber "replayGainAlbumGain"

getReplayGainAlbumPeak :: File -> Effect Number
getReplayGainAlbumPeak = getNumber "replayGainAlbumPeak"

setReplayGainAlbumPeak :: File -> Number -> Effect Unit
setReplayGainAlbumPeak = setNumber "replayGainAlbumPeak"

-- | `file.tag.title`; `Nothing` when unset.
getTitle :: File -> Effect (Maybe String)
getTitle = getString "title"

setTitle :: File -> String -> Effect Unit
setTitle = setString "title"

getAlbum :: File -> Effect (Maybe String)
getAlbum = getString "album"

setAlbum :: File -> String -> Effect Unit
setAlbum = setString "album"

-- | `file.tag.performers` (track artists).
getPerformers :: File -> Effect (Array String)
getPerformers = getStrings "performers"

setPerformers :: File -> Array String -> Effect Unit
setPerformers = setStrings "performers"

getAlbumArtists :: File -> Effect (Array String)
getAlbumArtists = getStrings "albumArtists"

setAlbumArtists :: File -> Array String -> Effect Unit
setAlbumArtists = setStrings "albumArtists"

getGenres :: File -> Effect (Array String)
getGenres = getStrings "genres"

setGenres :: File -> Array String -> Effect Unit
setGenres = setStrings "genres"

getComposers :: File -> Effect (Array String)
getComposers = getStrings "composers"

setComposers :: File -> Array String -> Effect Unit
setComposers = setStrings "composers"

getComment :: File -> Effect (Maybe String)
getComment = getString "comment"

setComment :: File -> String -> Effect Unit
setComment = setString "comment"

getLyrics :: File -> Effect (Maybe String)
getLyrics = getString "lyrics"

setLyrics :: File -> String -> Effect Unit
setLyrics = setString "lyrics"

getIsrc :: File -> Effect (Maybe String)
getIsrc = getString "isrc"

setIsrc :: File -> String -> Effect Unit
setIsrc = setString "isrc"

-- | `file.tag.year` (0 when unset).
getYear :: File -> Effect Int
getYear = getInt "year"

setYear :: File -> Int -> Effect Unit
setYear = setInt "year"

getTrack :: File -> Effect Int
getTrack = getInt "track"

setTrack :: File -> Int -> Effect Unit
setTrack = setInt "track"

getTrackCount :: File -> Effect Int
getTrackCount = getInt "trackCount"

setTrackCount :: File -> Int -> Effect Unit
setTrackCount = setInt "trackCount"

getDisc :: File -> Effect Int
getDisc = getInt "disc"

setDisc :: File -> Int -> Effect Unit
setDisc = setInt "disc"

getDiscCount :: File -> Effect Int
getDiscCount = getInt "discCount"

setDiscCount :: File -> Int -> Effect Unit
setDiscCount = setInt "discCount"
