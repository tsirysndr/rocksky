module Rocksky.Cli.Import.Scrobble where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Array (elem)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff, try, throwError)
import Foreign (Foreign)
import Rocksky.Cli.Client (field)
import Rocksky.Lib.Foreign as F

foreign import callImpl :: Foreign -> String -> Foreign -> Effect (Promise String)
foreign import existingImpl :: Foreign -> Foreign -> Effect (Promise (Nullable String))
foreign import isoTimestamp :: Number -> String

importScrobble :: Foreign -> Foreign -> Foreign -> Aff String
importScrobble agent input dedup = do
  existing <- if F.isNullish dedup then pure Nothing else toMaybe <$> toAffE (existingImpl dedup input)
  case existing of
    Just uri -> pure uri
    Nothing -> do
      result <- try $ toAffE $ callImpl agent "scrobbleMatch"
        ( F.omitNulls $ F.toForeign
            { title: value "title", artist: value "artist", album: value "album", mbId: value "mbId", isrc: value "isrc", timestamp: value "timestamp" }
        )
      case result of
        Right uri -> pure uri
        Left err -> do
          let e = F.toForeign err
          if
            field "name" e == "RockskyError" && field "kind" e == "NotFound"
              && elem (fromMaybe 0 (F.readIntAt "status" e)) [ 400, 404 ]
              && elem (field "message" e) [ "No unambiguous song match", "Song not found" ] then
            toAffE $ callImpl agent "scrobble"
              ( F.toForeign
                  { title: value "title"
                  , artist: value "artist"
                  , album: field "album" input
                  , albumArtist: value "artist"
                  , duration: 0
                  , mbid: value "mbId"
                  , isrc: value "isrc"
                  , createdAt: isoTimestamp (fromMaybe 0.0 (F.readNumberAt "timestamp" input))
                  }
              )
          else throwError err
  where
  value key = fromMaybe F.undefined (F.path key input)

formatError :: Foreign -> String
formatError value =
  if F.isNullish value then F.stringValue value
  else
    let
      message = field "message" value
      kind = field "kind" value
      status = fromMaybe 0 (F.readIntAt "status" value)
      details = (if kind == "" then [] else [ kind ]) <> (if status == 0 then [] else [ "HTTP " <> show status ])
    in
      if message == "" && kind == "" && status == 0 then F.stringValue value
      else (if message == "" then "Unknown import error" else message) <> if details == [] then "" else " [" <> joinWith ", " details <> "]"
