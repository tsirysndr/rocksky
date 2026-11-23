module Rocksky.Lib.ScrobbleStatus (scrobbleStatus) where

import Prelude
import Data.Maybe (Maybe(..))
import Data.Nullable (toMaybe)
import Data.Number as Number
import Foreign (Foreign)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Types.Track (Track)

-- Saved listens can infer current playback only within their original window.
scrobbleStatus :: String -> Track -> Number -> Maybe Foreign
scrobbleStatus did track current = case toMaybe track.timestamp of
  Just timestamp
    | Number.isFinite timestamp && timestamp > 0.0
    && Number.isFinite track.duration && track.duration > 0.0
    && timestamp * 1000.0 <= current
    && timestamp * 1000.0 + track.duration > current ->
      Just (toForeign
        { did
        , track:
            { name: track.title, artist: track.artist, album: track.album
            , albumCoverUrl: track.albumArt, duration_ms: track.duration
            , started_at: timestamp * 1000.0, source: "scrobble"
            }
        })
  _ -> Nothing
