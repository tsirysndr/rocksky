module Rocksky.Lib.DiscogsView where

import Prelude
import Data.Array (null)
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)
import Data.Number (round)
import Foreign (Foreign)
import Rocksky.Lib.Foreign (omitNulls, toForeign, undefined)
import Rocksky.Schema.DiscogsMasters (SelectDiscogsMaster)
import Rocksky.Schema.DiscogsReleases (SelectDiscogsRelease)
import Rocksky.Schema.DiscogsCredits (SelectDiscogsCredit)
import Rocksky.Schema.DiscogsTracks (SelectDiscogsTrack)
import Rocksky.Schema.DiscogsReleaseLabels (SelectDiscogsReleaseLabel)
import Rocksky.Schema.DiscogsIdentifiers (SelectDiscogsIdentifier)
import Rocksky.Schema.DiscogsReleaseArtists (SelectDiscogsReleaseArtist)

type DiscogsRelations =
  { credits :: Array SelectDiscogsCredit
  , tracklist :: Array SelectDiscogsTrack
  , labels :: Array SelectDiscogsReleaseLabel
  , identifiers :: Array SelectDiscogsIdentifier
  , artists :: Array SelectDiscogsReleaseArtist
  , master :: Nullable SelectDiscogsMaster
  }

orUndefined :: forall a. Array a -> (Array a -> Array Foreign) -> Foreign
orUndefined rows convert = if null rows then undefined else toForeign (convert rows)

toDiscogsCreditViews :: Array SelectDiscogsCredit -> Array Foreign
toDiscogsCreditViews = map (\row -> omitNulls (toForeign
  { artistId: row.artistId, name: row.name, role: row.role, tracks: row.tracks }))

toDiscogsTrackViews :: Array SelectDiscogsTrack -> Array Foreign
toDiscogsTrackViews = map (\row -> omitNulls (toForeign
  { position: row.position, type: row.type, title: row.title, duration: row.duration, durationMs: row.durationMs, discNumber: row.discNumber, trackNumber: row.trackNumber }))

toDiscogsLabelViews :: Array SelectDiscogsReleaseLabel -> Array Foreign
toDiscogsLabelViews = map (\row -> omitNulls (toForeign
  { labelId: row.labelId, name: row.name, catalogNumber: row.catalogNumber, kind: row.kind, entityType: row.entityType }))

toDiscogsIdentifierViews :: Array SelectDiscogsIdentifier -> Array Foreign
toDiscogsIdentifierViews = map (\row -> omitNulls (toForeign
  { type: row.type, value: row.value, description: row.description }))

toDiscogsArtistViews :: Array SelectDiscogsReleaseArtist -> Array Foreign
toDiscogsArtistViews = map (\row -> omitNulls (toForeign
  { artistId: row.artistId, name: row.name, anv: row.anv, joinPhrase: row.joinPhrase, role: row.role }))

toDiscogsMasterView :: Nullable SelectDiscogsMaster -> Foreign
toDiscogsMasterView master = case toMaybe master of
  Nothing -> undefined
  Just row -> omitNulls (toForeign
    { masterId: row.discogsId, title: row.title, artist: row.artist, year: row.year
    , mainReleaseId: row.mainReleaseId, url: row.discogsUrl, genres: row.genres, styles: row.styles })

toDiscogsView :: Nullable SelectDiscogsRelease -> DiscogsRelations -> Foreign
toDiscogsView release relations = case toMaybe release of
  Nothing -> undefined
  Just row -> omitNulls (toForeign
    { releaseId: row.discogsId, masterId: row.masterId, title: row.title, artist: row.artist
    , albumArt: row.albumArt, year: row.year, originalYear: row.originalYear
    , releaseDate: row.releaseDate, country: row.country, label: row.label
    , catalogNumber: row.catalogNumber, barcode: row.barcode, formats: row.formats
    , genres: row.genres, styles: row.styles, url: row.discogsUrl
    , score: case toMaybe row.score of
        Nothing -> undefined
        Just score -> toForeign (round (score * 100.0))
    , credits: orUndefined relations.credits toDiscogsCreditViews
    , tracklist: orUndefined relations.tracklist toDiscogsTrackViews
    , labels: orUndefined relations.labels toDiscogsLabelViews
    , identifiers: orUndefined relations.identifiers toDiscogsIdentifierViews
    , artists: orUndefined relations.artists toDiscogsArtistViews
    , master: toDiscogsMasterView relations.master
    })
