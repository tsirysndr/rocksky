module Rocksky.Xrpc.App.Rocksky.Song.MatchSongUris (catalogIdentity, Identity) where

import Prelude
import Consola as Log
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.Int (toNumber)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.Number (abs)
import Data.String (Pattern(..), Replacement(..), joinWith, replaceAll, toLower, toUpper)
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Node.Crypto (hashHex)
import Rocksky.Context (Context)
import Rocksky.Lib.Matching (MatchedCandidate)
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Tracks (SelectTrack)

type Identity =
  { record :: Maybe SelectTrack, album :: Maybe SelectAlbum, artist :: Maybe SelectArtist
  , uri :: Nullable String, albumUri :: Nullable String, artistUri :: Nullable String }

same :: String -> String -> Boolean
same a b = toLower a == toLower b

nonempty :: Nullable String -> Maybe String
nonempty value = toMaybe value >>= \s -> if s == "" then Nothing else Just s

settled :: forall a. Aff (Array a) -> Aff (Maybe a)
settled action = attempt action >>= case _ of
  Right rows -> pure (head rows)
  Left _ -> liftEffect (Log.warn "Song match catalog enrichment unavailable") $> Nothing

catalogIdentity :: Context -> MatchedCandidate -> Maybe SelectTrack -> Aff Identity
catalogIdentity ctx candidate selected = do
  let
    artist = joinWith ", " candidate.artists
    album = nonempty candidate.album
    albumTitle = fromMaybe "" (toMaybe candidate.album)
    albumArtist = fromMaybe (fromMaybe "" (head candidate.artists)) (toMaybe candidate.albumArtist)
    hash = SQL.string <<< hashHex "sha256" <<< toLower
  found <- sequential $ { record: _, album: _, artist: _ }
    <$> parallel (case selected, album of
      Just record, _ -> pure (Just record)
      _, Nothing -> pure Nothing
      _, Just title -> settled (run ctx.readDb (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (hash (candidate.title <> " - " <> artist <> " - " <> title))) # limit 1)))
    <*> parallel (case album of
      Nothing -> pure Nothing
      Just title -> settled (run ctx.readDb (selectFrom T.albums # where_ (SQL.eq (toSQL T.albumsC.sha256) (hash (title <> " - " <> albumArtist))) # limit 1)))
    <*> parallel (settled (run ctx.readDb (selectFrom T.artists # where_ (SQL.eq (toSQL T.artistsC.sha256) (hash albumArtist)) # limit 1)))
  let
    normalizeIsrc = toUpper <<< replaceAll (Pattern "-") (Replacement "")
    conflict normalize a b = case nonempty a, nonempty b of
      Just x, Just y -> normalize x /= normalize y
      _, _ -> false
    record = found.record >>= \row ->
      let durationConflict = case toMaybe candidate.durationMs of
            Just duration | duration /= 0.0 && row.duration > 1 -> abs (duration - toNumber row.duration) > max 5000.0 (duration / 50.0)
            _ -> false
      in if isJust selected || (same row.title candidate.title && same row.artist artist && same row.album albumTitle
        && not (conflict normalizeIsrc candidate.identifiers.isrc row.isrc)
        && not (conflict toLower candidate.identifiers.musicbrainzRecordingId row.mbId) && not durationConflict)
        then Just row else Nothing
    matchingAlbum = found.album >>= \row -> if same row.title albumTitle && same row.artist albumArtist then Just row else Nothing
    matchingArtist = found.artist >>= \row -> if same row.name albumArtist then Just row else Nothing
    fallbackAlbum = record >>= \row -> if same row.album albumTitle && same row.albumArtist albumArtist then toMaybe row.albumUri else Nothing
    fallbackArtist = record >>= \row -> if same row.albumArtist albumArtist then toMaybe row.artistUri else Nothing
  pure
    { record, album: matchingAlbum, artist: matchingArtist
    , uri: toNullable (record >>= toMaybe <<< _.uri)
    , albumUri: toNullable ((matchingAlbum >>= toMaybe <<< _.uri) <|> fallbackAlbum)
    , artistUri: toNullable ((matchingArtist >>= toMaybe <<< _.uri) <|> fallbackArtist) }
