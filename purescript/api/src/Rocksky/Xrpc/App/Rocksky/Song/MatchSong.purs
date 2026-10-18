module Rocksky.Xrpc.App.Rocksky.Song.MatchSong (register, retrieveMatch, presentMatch, candidateMatch) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable as N
import Data.Number as Number
import Data.String (Pattern(..), joinWith, split)
import Data.String.CodeUnits as CU
import Data.Traversable (traverse)
import Drizzle.Builder (limit, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Matching as Matching
import Rocksky.Lib.Rsql (numberValue)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.App.Rocksky.Song.MatchSongUris (catalogIdentity)

nil :: Foreign
nil = F.toForeign (N.null :: N.Nullable String)

nullable :: forall a. N.Nullable a -> Foreign
nullable = fromMaybe nil <<< map F.toForeign <<< N.toMaybe

optional :: forall a. N.Nullable a -> Foreign
optional = fromMaybe F.undefined <<< map F.toForeign <<< N.toMaybe

nonempty :: N.Nullable String -> Maybe String
nonempty value = N.toMaybe value >>= \s -> if s == "" then Nothing else Just s

retrieveMatch :: Context -> Foreign -> Aff Foreign
retrieveMatch ctx params = do
  request <- Matching.matchingRequest params
  result <- Matching.resolveMatch ctx request N.null
  presentMatch ctx result

presentMatch :: Context -> Matching.MatchResponse -> Aff Foreign
presentMatch ctx result = case N.toMaybe result.track <|> (if result.status == "ambiguous" then _.track <$> A.head result.candidates else Nothing) of
  Nothing -> pure (F.toForeign { matches: [] :: Array Foreign })
  Just candidate -> do
    metadata <- Matching.candidateMetadata candidate
    selected <- if candidate.source /= "catalog" then pure Nothing else A.head <$> (run ctx.readDb
      (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string candidate.id)) # limit 1) :: Aff (Array SelectTrack))
    identity <- catalogIdentity ctx candidate selected
    now <- liftEffect Date.now
    let
      catalog = F.toForeign (Object.filterWithKey (\key value -> not (F.isNullish value) && F.asString value /= Just ""
        && not (key == "duration" && fromMaybe 0.0 (F.asNumber value) <= 1.0))
        (fromMaybe Object.empty (identity.record >>= F.asObject <<< F.toForeign)))
      base = F.toForeign
        { id: "", title: candidate.title, artist: joinWith ", " candidate.artists, album: fromMaybe "" (N.toMaybe candidate.album)
        , albumArtist: fromMaybe (fromMaybe "" (A.head candidate.artists)) (N.toMaybe candidate.albumArtist)
        , albumArt: nullable metadata.albumArt, duration: fromMaybe 0.0 (N.toMaybe metadata.duration)
        , mbId: nullable metadata.mbId, isrc: nullable metadata.isrc, trackNumber: nullable metadata.trackNumber, discNumber: nullable metadata.discNumber
        , genre: fromMaybe nil (F.toForeign <<< joinWith ", " <$> N.toMaybe metadata.genres), label: nullable metadata.label, spotifyLink: nullable metadata.spotifyLink
        , youtubeLink: nil, appleMusicLink: nil, tidalLink: nil, sha256: "", lyrics: nil, composer: nil, copyrightMessage: nil
        , key: nil, bpm: nil, acoustidFingerprint: nil, uri: nil, albumUri: nil, artistUri: nil, createdAt: now, updatedAt: now, xataVersion: 0 }
      merged = F.mergeForeign base catalog
      genre = F.readStringAt "genre" merged >>= \s -> if s == "" then Nothing else Just s
      genres = (map (A.filter (_ /= "") <<< split (Pattern ", ")) genre) <|> N.toMaybe metadata.genres <|> (identity.artist >>= N.toMaybe <<< _.genres)
      albumArt = (identity.album >>= nonempty <<< _.albumArt)
      track = F.mergeForeign merged (F.toForeign
        { title: candidate.title, artist: joinWith ", " candidate.artists, album: fromMaybe "" (N.toMaybe candidate.album)
        , albumArtist: fromMaybe (fromMaybe F.undefined (F.path "albumArtist" merged)) (F.toForeign <$> N.toMaybe candidate.albumArtist)
        , albumArt: fromMaybe (fromMaybe nil (F.path "albumArt" merged)) (F.toForeign <$> albumArt)
        , genre: fromMaybe nil (F.toForeign <$> (genre <|> (genres >>= \xs -> let s = joinWith ", " xs in if s == "" then Nothing else Just s))) })
    counts <- case identity.record of
      Nothing -> pure { listeners: [], plays: [] }
      Just record -> sequential $ { listeners: _, plays: _ }
        <$> parallel (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.userTracks # where_ (SQL.eq (toSQL T.userTracksC.trackId) (SQL.string record.id))) :: Aff (Array { count :: Int }))
        <*> parallel (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.scrobbles # where_ (SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string record.id))) :: Aff (Array { count :: Int }))
    let dates = F.unsafeFromForeign track :: { createdAt :: Date.JSDate, updatedAt :: Date.JSDate }
    createdAt <- liftEffect (Date.toISOString dates.createdAt)
    updatedAt <- liftEffect (Date.toISOString dates.updatedAt)
    metadataDate <- liftEffect (traverse (map (CU.take 10) <<< Date.toISOString) (N.toMaybe metadata.releaseDate))
    matches <- traverse (candidateMatch <<< _.track) (A.filter (\c -> c.track.source /= "catalog") result.candidates)
    pure (F.mergeForeign track (F.toForeign
      { id: fromMaybe (fromMaybe F.undefined (F.path "id" track)) (F.toForeign <<< _.id <$> identity.record)
      , sha256: fromMaybe (fromMaybe F.undefined (F.path "sha256" track)) (F.toForeign <<< _.sha256 <$> identity.record)
      , uri: identity.uri, albumUri: identity.albumUri, artistUri: identity.artistUri, createdAt, updatedAt
      , releaseDate: fromMaybe nil (F.toForeign <$> ((identity.album >>= nonempty <<< _.releaseDate) <|> metadataDate))
      , year: fromMaybe nil ((F.toForeign <$> (identity.album >>= N.toMaybe <<< _.year)) <|> (F.toForeign <$> N.toMaybe metadata.year))
      , artistPicture: fromMaybe nil (F.toForeign <$> ((identity.artist >>= nonempty <<< _.picture) <|> nonempty metadata.artistPicture))
      , genres: fromMaybe nil (F.toForeign <$> genres), mbArtists: nullable candidate.musicbrainzArtists, matches
      , playCount: fromMaybe 0 (_.count <$> A.head counts.plays), uniqueListeners: fromMaybe 0 (_.count <$> A.head counts.listeners) }))

candidateMatch :: Matching.MatchedCandidate -> Aff Foreign
candidateMatch candidate = do
  metadata <- Matching.candidateMetadata candidate
  let
    ids = candidate.identifiers
    deezer = if candidate.source == "deezer" then numberValue (fromMaybe candidate.id (N.toMaybe ids.deezerTrackId)) else Nothing
    deezerId = case deezer of
      Just id | id > 0.0 && id <= 9007199254740991.0 && Number.floor id == id -> F.toForeign id
      _ -> F.undefined
    link = nonempty candidate.providerLink <|> (case candidate.source of
      "deezer" -> N.toMaybe metadata.deezerLink
      "spotify" -> N.toMaybe metadata.spotifyLink
      "musicbrainz" -> ("https://musicbrainz.org/recording/" <> _) <$> nonempty ids.musicbrainzRecordingId
      _ -> Nothing)
  pure (F.toForeign
    { score: fromMaybe F.undefined (F.toForeign <<< Number.floor <<< (_ + 0.5) <$> N.toMaybe candidate.providerScore)
    , rank: optional candidate.providerRank, source: candidate.source, providerId: candidate.id, id: deezerId
    , title: candidate.title, artist: joinWith ", " candidate.artists, album: optional candidate.album, albumArt: optional candidate.albumArt
    , isrc: optional ids.isrc, durationMs: optional candidate.durationMs, trackNumber: optional candidate.trackNumber, discNumber: optional candidate.discNumber
    , mbId: optional ids.musicbrainzRecordingId, mbReleaseId: optional ids.musicbrainzReleaseId, mbArtists: optional candidate.musicbrainzArtists
    , preview: fromMaybe F.undefined (F.toForeign <$> nonempty candidate.preview), link: fromMaybe F.undefined (F.toForeign <$> link) })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.song.matchSong"
  { auth: Nothing, handler: \input -> Xrpc.Json <$> retrieveMatch ctx input.params }
