module Rocksky.Lib.Matching where

import Prelude
import Axios as Axios
import Consola as Log
import Control.Alt ((<|>))
import Data.Array (null)
import Data.Array.NonEmpty as NE
import Data.Either (Either(..), hush)
import Data.Int as Int
import Data.JSDate (JSDate)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.Number as Number
import Data.String (Pattern(..), contains, stripPrefix, trim)
import Data.String.Regex (match, regex, test)
import Data.String.Regex.Flags (noFlags)
import Data.Traversable (traverse)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Fetch.URL as URL
import Foreign (Foreign)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (asNumber, omitNulls, path, readArrayAt, readStringAt, stringify, toForeign, undefined, unsafeFromForeign)
import Rocksky.Lib.Validate as V

type Identifiers =
  { musicbrainzRecordingId :: Nullable (String)
  , musicbrainzReleaseId :: Nullable (String)
  , isrc :: Nullable (String)
  , spotifyTrackId :: Nullable (String)
  , deezerTrackId :: Nullable (String)
  }

identifiersSchema :: V.Decoder Identifiers
identifiersSchema = V.object \o ->
  { musicbrainzRecordingId: _, musicbrainzReleaseId: _, isrc: _, spotifyTrackId: _, deezerTrackId: _ }
    <$> V.optionalNullablePreserve "musicbrainzRecordingId" (V.string) o
    <*> V.optionalNullablePreserve "musicbrainzReleaseId" (V.string) o
    <*> V.optionalNullablePreserve "isrc" (V.string) o
    <*> V.optionalNullablePreserve "spotifyTrackId" (V.string) o
    <*> V.optionalNullablePreserve "deezerTrackId" (V.string) o

artistSchema :: V.Decoder { mbid :: String, name :: String }
artistSchema = V.object \o -> { mbid: _, name: _ } <$> V.field "mbid" V.string o <*> V.field "name" V.string o

type MatchedCandidate =
  { source :: String
  , id :: String
  , title :: String
  , artists :: Array String
  , album :: Nullable (String)
  , albumArtist :: Nullable (String)
  , durationMs :: Nullable (Number)
  , albumArt :: Nullable (String)
  , releaseDate :: Nullable (String)
  , identifiers :: Identifiers
  , trackNumber :: Nullable (Number)
  , discNumber :: Nullable (Number)
  , label :: Nullable (String)
  , genres :: Nullable (Array String)
  , artistPicture :: Nullable (String)
  , musicbrainzArtists :: Nullable (Array { mbid :: String, name :: String })
  , spotifyLink :: Nullable (String)
  , providerScore :: Nullable (Number)
  , providerRank :: Nullable (Number)
  , providerLink :: Nullable (String)
  , preview :: Nullable (String)
  }

candidateSchema :: V.Decoder MatchedCandidate
candidateSchema = V.object \o ->
  { source: _, id: _, title: _, artists: _, album: _, albumArtist: _, durationMs: _, albumArt: _, releaseDate: _, identifiers: _, trackNumber: _, discNumber: _, label: _, genres: _, artistPicture: _, musicbrainzArtists: _, spotifyLink: _, providerScore: _, providerRank: _, providerLink: _, preview: _ }
    <$> V.field "source" (V.string) o
    <*> V.field "id" (V.string) o
    <*> V.field "title" (V.string) o
    <*> V.field "artists" (V.refine (not <<< null) "Expected at least one artist" (V.array V.string)) o
    <*> V.optionalNullablePreserve "album" (V.string) o
    <*> V.optionalNullablePreserve "albumArtist" (V.string) o
    <*> V.optionalNullablePreserve "durationMs" (V.number) o
    <*> V.optionalNullablePreserve "albumArt" (V.string) o
    <*> V.optionalNullablePreserve "releaseDate" (V.string) o
    <*> V.field "identifiers" (identifiersSchema) o
    <*> V.optionalNullablePreserve "trackNumber" (V.number) o
    <*> V.optionalNullablePreserve "discNumber" (V.number) o
    <*> V.optionalNullablePreserve "label" (V.string) o
    <*> V.optionalNullablePreserve "genres" (V.array V.string) o
    <*> V.optionalNullablePreserve "artistPicture" (V.string) o
    <*> V.optionalNullablePreserve "musicbrainzArtists" (V.array artistSchema) o
    <*> V.optionalNullablePreserve "spotifyLink" (V.string) o
    <*> V.optionalNullablePreserve "providerScore" (V.refine (\n -> Number.isFinite n && n >= 0.0 && n <= 100.0) "Invalid provider score" V.number) o
    <*> V.optionalNullablePreserve "providerRank" (V.refine (\n -> Number.isFinite n && Number.floor n == n) "Expected integer" V.number) o
    <*> V.optionalNullablePreserve "providerLink" (V.string) o
    <*> V.optionalNullablePreserve "preview" (V.string) o

type MatchResponse =
  { policyVersion :: String, status :: String, track :: Nullable MatchedCandidate
  , candidates :: Array { track :: MatchedCandidate }, warnings :: Array String }

responseSchema :: V.Decoder MatchResponse
responseSchema = V.refine (\r -> (r.status == "matched") == isJust (toMaybe r.track))
  "Invalid matching status/track combination" $ V.object \o ->
    { policyVersion: _, status: _, track: _, candidates: _, warnings: _ }
      <$> V.field "policyVersion" V.string o
      <*> V.field "status" (V.refine (\s -> s == "matched" || s == "ambiguous" || s == "unmatched") "Invalid match status" V.string) o
      <*> V.nullable "track" candidateSchema o
      <*> (fromMaybe [] <$> V.optional "candidates" (V.array (V.object \c -> { track: _ } <$> V.field "track" candidateSchema c)) o)
      <*> (fromMaybe [] <$> V.optional "warnings" (V.array V.string) o)

optionalText :: Nullable String -> Maybe String
optionalText value = toMaybe value >>= \s -> if trim s == "" then Nothing else Just (trim s)

matches :: String -> String -> Boolean
matches pattern value = fromMaybe false (test <$> hush (regex pattern noFlags) <*> pure value)

capture :: String -> String -> Maybe String
capture pattern value = do
  re <- hush (regex pattern noFlags)
  groups <- match re value
  NE.index groups 1 >>= identity

spotifyTrackId :: Nullable String -> Maybe String
spotifyTrackId value = do
  original <- toMaybe value
  let trimmed = trim original
  id <- case stripPrefix (Pattern "spotify:track:") trimmed of
    Just id -> Just id
    Nothing | contains (Pattern "://") trimmed -> do
      url <- URL.parse trimmed
      if url.hostname == "open.spotify.com" then capture "^/track/([^/]+)$" url.pathname else Nothing
    Nothing -> Just trimmed
  if matches "^[A-Za-z0-9]{22}$" id then Just id else Nothing

-- The request stays a JSON object so absent fields remain omitted in cache keys.
matchingRequest :: Foreign -> Aff Foreign
matchingRequest track = do
  let title = fromMaybe "" (readStringAt "title" track)
  let artist = fromMaybe "" (readStringAt "artist" track)
  when (trim title == "" || trim artist == "") (throwError (error "Matching requires title and artist"))
  let supplied = fromMaybe [] (readArrayAt "artists" track)
  let artists = if null supplied then [artist] else map (fromMaybe "" <<< readStringAt "name") supplied
  let text key = optionalText (toNullable (readStringAt key track))
  let duration = path "duration" track >>= asNumber
  let durationMs = duration >>= \n -> if n > 1.0 then Just (Number.floor (n + 0.5)) else Nothing
  let identifiers = omitNulls (toForeign { musicbrainzRecordingId: toNullable (text "mbId"), isrc: toNullable (text "isrc"), spotifyTrackId: toNullable (spotifyTrackId (toNullable (readStringAt "spotifyLink" track))) })
  pure (omitNulls (toForeign { title, artists, album: toNullable (text "album"), albumArtist: toNullable (text "albumArtist"), durationMs: toNullable durationMs, identifiers }))

resolveMatch :: Context -> Foreign -> Nullable Axios.AbortSignal -> Aff MatchResponse
resolveMatch ctx request signal = do
  response <- Axios.postWithSignal ctx.matching "/v1/match" request signal
  result <- case V.run responseSchema (Axios.data_ response) of
    Left errors -> throwError (error (V.formatZodLike errors))
    Right result -> pure result
  unless (null result.warnings) (liftEffect (Log.warnF "Matching provider warnings:" [toForeign result.warnings]))
  pure result

matchTrack :: Context -> Foreign -> Nullable Axios.AbortSignal -> Aff (Nullable MatchedCandidate)
matchTrack ctx request signal = _.track <$> resolveMatch ctx request signal

matchingCacheKey :: Foreign -> String
matchingCacheKey request = "matching:v1:" <> sha256Hex (stringify request)

type Metadata =
  { mbId :: Nullable String, isrc :: Nullable String, albumArt :: Nullable String
  , duration :: Nullable Number, trackNumber :: Nullable Number, discNumber :: Nullable Number
  , label :: Nullable String, genres :: Nullable (Array String), artistPicture :: Nullable String
  , releaseDate :: Nullable JSDate, year :: Nullable Int
  , spotifyLink :: Nullable String, deezerLink :: Nullable String }

absent :: forall a. Nullable a
absent = unsafeFromForeign undefined

optionalValue :: forall a. Maybe a -> Nullable a
optionalValue = case _ of
  Just value -> toNullable (Just value)
  Nothing -> absent

candidateMetadata :: MatchedCandidate -> Aff Metadata
candidateMetadata c = do
  releaseDate <- liftEffect $ traverse Date.parse $ toMaybe c.releaseDate >>= \date -> if matches "^\\d{4}-\\d{2}-\\d{2}$" date then Just date else Nothing
  let year = toMaybe c.releaseDate >>= capture "^\\s*([+-]?[0-9]+)" >>= Int.fromString >>= \n -> if n == 0 then Nothing else Just n
  let link prefix value = toMaybe value >>= \id -> if id == "" then Nothing else Just (prefix <> id)
  pure
    { mbId: c.identifiers.musicbrainzRecordingId, isrc: c.identifiers.isrc, albumArt: c.albumArt
    , duration: c.durationMs, trackNumber: c.trackNumber, discNumber: c.discNumber
    , label: c.label, genres: c.genres, artistPicture: c.artistPicture
    , releaseDate: optionalValue releaseDate, year: optionalValue year
    , spotifyLink: optionalValue (toMaybe c.spotifyLink <|> link "https://open.spotify.com/track/" c.identifiers.spotifyTrackId)
    , deezerLink: optionalValue (link "https://www.deezer.com/track/" c.identifiers.deezerTrackId)
    }
