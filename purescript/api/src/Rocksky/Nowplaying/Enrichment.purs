module Rocksky.Nowplaying.Enrichment (enrich, catalogMetadata, albumMetadata, present) where

import Prelude
import Control.Alt ((<|>))
import Data.Array (null)
import Data.Int (toNumber)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.Traversable (traverse)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.Lib.Matching (MatchedCandidate, candidateMetadata)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Types.Track (Track, MusicbrainzTrack)

present :: Nullable String -> Boolean
present value = case toMaybe value of
  Just s -> s /= ""
  Nothing -> false

text :: Nullable String -> Nullable String -> Nullable String
text a b = if present a then a else b

number :: Nullable Number -> Nullable Number -> Nullable Number
number a b = case toMaybe a of
  Just n | n /= 0.0 -> a
  _ -> b

missing :: forall a. Nullable a -> Nullable a -> Nullable a
missing a b = toNullable (toMaybe a <|> toMaybe b)

array :: forall a. Nullable (Array a) -> Nullable (Array a) -> Nullable (Array a)
array a b = if null (fromMaybe [] (toMaybe a)) then b else a

enrich :: Track -> MatchedCandidate -> Aff { track :: Track, mbTrack :: Maybe MusicbrainzTrack, catalogId :: Maybe String }
enrich original candidate = do
  m <- candidateMetadata candidate
  let track = original
        { mbId = missing original.mbId m.mbId
        , artists = if null (fromMaybe [] (toMaybe original.artists)) && not (null (fromMaybe [] (toMaybe candidate.musicbrainzArtists))) then toNullable (map (map (\a -> { mbid: toNullable (Just a.mbid), name: a.name })) (toMaybe candidate.musicbrainzArtists)) else original.artists
        , isrc = missing original.isrc m.isrc
        , albumArt = text original.albumArt m.albumArt
        , duration = if original.duration <= 1.0 then fromMaybe original.duration (toMaybe m.duration) else original.duration
        , trackNumber = number original.trackNumber m.trackNumber
        , discNumber = number original.discNumber m.discNumber
        , label = text original.label m.label
        , releaseDate = missing original.releaseDate m.releaseDate
        , year = number original.year (toNullable (toNumber <$> toMaybe m.year))
        , artistPicture = text original.artistPicture m.artistPicture
        , genres = array original.genres m.genres
        , spotifyLink = text original.spotifyLink m.spotifyLink
        , deezerLink = text original.deezerLink m.deezerLink
        }
  let mbTrack = case toMaybe m.mbId of
        Just id | id /= "" -> Just
          { trackMBID: id
          , releaseMBID: fromMaybe "" (toMaybe candidate.identifiers.musicbrainzReleaseId)
          , name: candidate.title
          , album: fromMaybe track.album (toMaybe candidate.album)
          , artist: map (\a -> { id: a.mbid, mbid: a.mbid, name: a.name }) (fromMaybe [] (toMaybe candidate.musicbrainzArtists))
          , timestamp: "" }
        _ -> Nothing
  pure { track, mbTrack, catalogId: if candidate.source == "catalog" then Just candidate.id else Nothing }

catalogMetadata :: Track -> SelectTrack -> Track
catalogMetadata track existing = track
  { trackNumber = missing track.trackNumber (toNullable (toNumber <$> toMaybe existing.trackNumber))
  , discNumber = missing track.discNumber (toNullable (toNumber <$> toMaybe existing.discNumber))
  , composer = text track.composer existing.composer
  , lyrics = text track.lyrics existing.lyrics
  , copyrightMessage = text track.copyrightMessage existing.copyrightMessage
  , mbId = text track.mbId existing.mbId
  , isrc = text track.isrc existing.isrc
  , genres = if null (fromMaybe [] (toMaybe track.genres)) && present existing.genre then toNullable (map (\g -> [g]) (toMaybe existing.genre)) else track.genres
  , spotifyLink = text track.spotifyLink existing.spotifyLink
  , albumArt = text track.albumArt existing.albumArt
  }

albumMetadata :: Track -> SelectAlbum -> Aff Track
albumMetadata track album = do
  date <- if toMaybe track.releaseDate == Nothing && present album.releaseDate
    then liftEffect (traverse Date.parse (toMaybe album.releaseDate))
    else pure (toMaybe track.releaseDate)
  pure (track { year = missing track.year (toNullable (toNumber <$> toMaybe album.year)), releaseDate = toNullable date, albumArt = text track.albumArt album.albumArt })
