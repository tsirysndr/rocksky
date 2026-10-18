module Rocksky.Lib.DiscogsEnrichment where

import Prelude
import Consola as Log
import Control.Alt ((<|>))
import Data.Array (filter, find, head, mapWithIndex)
import Data.JSDate (JSDate, getTime, now)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, notNull, null, toMaybe, toNullable)
import Data.String (toLower, trim)
import Drizzle.Builder (InsertQ, deleteFrom, insertForeign, limit, onConflictDoUpdate, run, runDelete, runInsert, runInsertReturning, runUpdate, selectFieldsFrom, selectFrom, update)
import Drizzle.Database (transaction)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.Schema (Table, toSQL)
import Drizzle.SQL as SQL
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Discogs as D
import Rocksky.Lib.DiscogsRelation as R
import Rocksky.Lib.Foreign (mergeForeign, toForeign, unsafeFromForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.DiscogsReleases (SelectDiscogsRelease)
import Rocksky.Schema.DiscogsSearches (SelectDiscogsSearch)

data DiscogsLookup = Matched SelectDiscogsRelease | Missed | Unavailable | Skipped

missRetryMs :: Number
missRetryMs = 30.0 * 24.0 * 60.0 * 60.0 * 1000.0

discogsSearchKey :: String -> String -> String
discogsSearchKey artist album = sha256Hex (toLower (trim album <> " - " <> trim artist))

isStaleSearch :: forall r. { releaseId :: Nullable String, searchedAt :: JSDate | r } -> Number -> Boolean
isStaleSearch search current = not (present search.releaseId) && current - getTime search.searchedAt > missRetryMs

present :: Nullable String -> Boolean
present value = case toMaybe value of
  Just s -> s /= ""
  Nothing -> false

nullable :: forall a. Nullable a -> Nullable a
nullable = toNullable <<< toMaybe

toDiscogsCreditRows :: String -> Array D.DiscogsCredit -> Array Foreign
toDiscogsCreditRows releaseId = mapWithIndex (\position credit -> toForeign
  { releaseId, artistId: R.nonzero credit.artistId, name: R.clean credit.name, role: R.trimmed credit.role, tracks: R.trimmed credit.tracks, position })
  <<< filter (\credit -> R.clean credit.name /= "")

toDiscogsReleaseRow :: D.DiscogsEnrichedTrack -> Maybe Number -> Maybe Foreign
toDiscogsReleaseRow track score
  | fromMaybe 0 (toMaybe track.discogsReleaseId) == 0 || not (present (notNull track.album)) || not (present (notNull track.artist)) = Nothing
  | otherwise = Just $ toForeign
      { discogsId: track.discogsReleaseId, masterId: nullable track.discogsMasterId, title: track.album
      , artist: if present track.albumArtist then fromMaybe track.artist (toMaybe track.albumArtist) else track.artist
      , albumArt: nullable track.albumArt, year: nullable track.year, originalYear: nullable track.originalYear
      , releaseDate: nullable track.releaseDate, country: nullable track.country, label: nullable track.label
      , catalogNumber: nullable track.catalogNumber, barcode: nullable track.barcode, formats: nullable track.formats
      , genres: nullable track.genres, styles: nullable track.styles, discogsUrl: nullable track.discogsUrl, score: toNullable score }

matchScore :: D.DiscogsEnrichResponse -> Maybe Number
matchScore response = (_.score <$> find (\m -> Just m.id == (toMaybe response.track >>= toMaybe <<< _.discogsReleaseId)) response.matches) <|> (_.score <$> head response.matches)

findRow :: forall cols r. Context -> Table Postgres cols -> SQL.SQL -> Aff (Maybe (Record r))
findRow ctx table condition = head <$> run ctx.db (selectFrom table # where_ condition # limit 1)

conflict :: SQL.SQL -> Foreign -> InsertQ Postgres -> InsertQ Postgres
conflict target values = onConflictDoUpdate { target: [target], set: (unsafeFromForeign values :: {}), where_: Nothing }

linkAlbum :: Context -> { album :: String, artist :: String, albumId :: Maybe String } -> String -> Aff Unit
linkAlbum ctx target releaseId = do
  let condition = case target.albumId of
        Just id | id /= "" -> SQL.eq (toSQL T.albumsC.id) (SQL.string id)
        _ -> SQL.eq (toSQL T.albumsC.sha256) (SQL.string (sha256Hex (toLower (target.album <> " - " <> target.artist))))
  existing :: Maybe SelectAlbum <- findRow ctx T.albums condition
  case existing of
    Just album | not (present album.discogsReleaseId) ->
      runUpdate ctx.db (update T.albums { discogsReleaseId: notNull releaseId } # where_ (SQL.eq (toSQL T.albumsC.id) (SQL.string album.id)))
    _ -> pure unit

recordSearch :: Context -> { sha256 :: String, artist :: String, album :: String, releaseId :: Nullable String, score :: Nullable Number } -> Aff Unit
recordSearch ctx values = do
  searchedAt <- liftEffect now
  runInsert ctx.db (insertForeign T.discogsSearches [mergeForeign (toForeign values) (toForeign { searchedAt })]
    # conflict (toSQL T.discogsSearchesC.sha256) (toForeign { releaseId: values.releaseId, score: nullable values.score, searchedAt, updatedAt: searchedAt }))

storeCredits :: Context -> String -> Array D.DiscogsCredit -> Aff Unit
storeCredits ctx releaseId credits = transaction ctx.db \tx -> do
  runDelete tx (deleteFrom T.discogsCredits # where_ (SQL.eq (toSQL T.discogsCreditsC.releaseId) (SQL.string releaseId)))
  runInsert tx (insertForeign T.discogsCredits (toDiscogsCreditRows releaseId credits))

writeReleaseChildren :: Context -> String -> D.DiscogsRelease -> Aff Unit
writeReleaseChildren ctx releaseId release = transaction ctx.db \tx -> do
  runDelete tx (deleteFrom T.discogsReleaseArtists # where_ (SQL.eq (toSQL T.discogsReleaseArtistsC.releaseId) (SQL.string releaseId)))
  runDelete tx (deleteFrom T.discogsReleaseLabels # where_ (SQL.eq (toSQL T.discogsReleaseLabelsC.releaseId) (SQL.string releaseId)))
  runDelete tx (deleteFrom T.discogsIdentifiers # where_ (SQL.eq (toSQL T.discogsIdentifiersC.releaseId) (SQL.string releaseId)))
  runDelete tx (deleteFrom T.discogsTracks # where_ (SQL.eq (toSQL T.discogsTracksC.releaseId) (SQL.string releaseId)))
  runInsert tx (insertForeign T.discogsReleaseArtists (R.toReleaseArtistRows releaseId (fromMaybe [] (toMaybe release.artists))))
  runInsert tx (insertForeign T.discogsReleaseLabels (R.toReleaseLabelRows releaseId release))
  runInsert tx (insertForeign T.discogsIdentifiers (R.toIdentifierRows releaseId (fromMaybe [] (toMaybe release.identifiers))))
  runInsert tx (insertForeign T.discogsTracks (R.toTrackRows releaseId (fromMaybe [] (toMaybe release.tracklist))))

storeMaster :: Context -> Int -> Aff Unit
storeMaster ctx masterId = do
  rows :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.discogsMastersC.id } T.discogsMasters # where_ (SQL.eq (toSQL T.discogsMastersC.discogsId) (SQL.int masterId)) # limit 1)
  unless (isJust (head rows)) do
    master <- D.getDiscogsMaster ctx masterId
    case master >>= R.toMasterRow of
      Nothing -> pure unit
      Just row -> do
        updatedAt <- liftEffect now
        runInsert ctx.db (insertForeign T.discogsMasters [row] # conflict (toSQL T.discogsMastersC.discogsId) (mergeForeign row (toForeign { updatedAt })))

storeRelations :: Context -> String -> Int -> Nullable Int -> Aff Unit
storeRelations ctx releaseId discogsId masterId = do
  release <- D.getDiscogsRelease ctx discogsId
  case release of
    Just row -> writeReleaseChildren ctx releaseId row
    Nothing -> pure unit
  case toMaybe masterId of
    Just id | id /= 0 -> storeMaster ctx id
    _ -> pure unit

enrichAlbumWithDiscogs :: Context -> String -> String -> Maybe String -> Aff DiscogsLookup
enrichAlbumWithDiscogs ctx artist album albumId
  | trim artist == "" || trim album == "" = pure Skipped
  | otherwise = do
      let sha256 = discogsSearchKey artist album
      existing :: Maybe SelectDiscogsSearch <- findRow ctx T.discogsSearches (SQL.eq (toSQL T.discogsSearchesC.sha256) (SQL.string sha256))
      current <- liftEffect (getTime <$> now)
      cached <- case existing of
        Just search | not (isStaleSearch search current) -> case toMaybe search.releaseId of
          Just id | id /= "" -> do
            release :: Maybe SelectDiscogsRelease <- findRow ctx T.discogsReleases (SQL.eq (toSQL T.discogsReleasesC.id) (SQL.string id))
            case release of
              Just row | isJust (toMaybe row.creditsFetchedAt) -> do
                linkAlbum ctx { album, artist, albumId } row.id
                pure (Just (Matched row))
              _ -> pure Nothing
          _ -> pure (Just Missed)
        _ -> pure Nothing
      case cached of
        Just result -> pure result
        Nothing -> fetch sha256
  where
  fetch sha256 = do
    response <- D.enrichWithDiscogs ctx { artist, album: notNull album, title: null }
    case response of
      Nothing -> pure Unavailable
      Just result -> case toMaybe result.track >>= \t -> toDiscogsReleaseRow t (matchScore result) of
        Nothing -> do
          recordSearch ctx { sha256, artist, album, releaseId: null, score: null }
          liftEffect (Log.info ("No Discogs match for " <> artist <> " - " <> album))
          pure Missed
        Just row -> do
          updatedAt <- liftEffect now
          releases :: Array SelectDiscogsRelease <- runInsertReturning ctx.db
            (insertForeign T.discogsReleases [mergeForeign row (toForeign { creditsFetchedAt: null :: Nullable JSDate })]
              # conflict (toSQL T.discogsReleasesC.discogsId) (mergeForeign row (toForeign { creditsFetchedAt: null :: Nullable JSDate, updatedAt })))
          release <- case head releases of
            Nothing -> throwError (error "Discogs release write returned no row")
            Just release -> pure release
          storeCredits ctx release.id (fromMaybe [] (toMaybe result.track >>= toMaybe <<< _.credits))
          storeRelations ctx release.id release.discogsId release.masterId
          completedAt <- liftEffect now
          runUpdate ctx.db (update T.discogsReleases { creditsFetchedAt: notNull completedAt, updatedAt: completedAt } # where_ (SQL.eq (toSQL T.discogsReleasesC.id) (SQL.string release.id)))
          recordSearch ctx { sha256, artist, album, releaseId: notNull release.id, score: toNullable (matchScore result) }
          linkAlbum ctx { album, artist, albumId } release.id
          liftEffect (Log.info ("Discogs matched " <> artist <> " - " <> album <> " to release " <> show release.discogsId))
          pure (Matched (release { creditsFetchedAt = notNull completedAt }))

enrichScrobbleWithDiscogs :: Context -> Nullable String -> Aff Unit
enrichScrobbleWithDiscogs ctx trackId = do
  track :: Maybe SelectTrack <- findRow ctx T.tracks (SQL.eq (toSQL T.tracksC.id) (SQL.param trackId))
  case track of
    Nothing -> pure unit
    Just row -> void (enrichAlbumWithDiscogs ctx (if row.albumArtist /= "" then row.albumArtist else row.artist) row.album Nothing)
