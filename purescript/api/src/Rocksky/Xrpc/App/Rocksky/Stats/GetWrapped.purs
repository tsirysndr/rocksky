module Rocksky.Xrpc.App.Rocksky.Stats.GetWrapped (register, retrieve, periodWindow, normalizePeriod, computeLongestStreak, presentation) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Foldable (foldl)
import Data.Int as Int
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Number as Number
import Data.Traversable (traverse)
import Drizzle.Builder (SelectQ, innerJoin, limit, orderBy, run, selectFieldsFrom)
import Drizzle.Database (Database, executeRows)
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
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.App.Rocksky.Stats.WrappedQuery (wrappedSummaryQuery)
import Rocksky.Xrpc.Util as Util

type Window = { year :: Int, startDate :: Date.JSDate, endDate :: Date.JSDate }

normalizePeriod :: String -> String
normalizePeriod p = if A.elem p ["year", "3months", "month", "2weeks", "week"] then p else "year"

periodWindow :: Date.JSDate -> String -> Int -> Window
periodWindow now period year
  | period == "year" =
      { year, startDate: Date.jsdate { year: Int.toNumber year, month: 0.0, day: 1.0, hour: 0.0, minute: 0.0, second: 0.0, millisecond: 0.0 }
      , endDate: Date.jsdate { year: Int.toNumber (year + 1), month: 0.0, day: 1.0, hour: 0.0, minute: 0.0, second: 0.0, millisecond: 0.0 } }
  | otherwise =
      { year: Int.round (Date.getUTCFullYear now), endDate: now
      , startDate: Date.jsdate
          { year: Date.getUTCFullYear now
          , month: Date.getUTCMonth now - (if period == "3months" then 3.0 else if period == "month" then 1.0 else 0.0)
          , day: Date.getUTCDate now - (if period == "2weeks" then 14.0 else if period == "week" then 7.0 else 0.0)
          , hour: Date.getUTCHours now, minute: Date.getUTCMinutes now, second: Date.getUTCSeconds now, millisecond: Date.getUTCMilliseconds now }
      }

computeLongestStreak :: Array String -> Effect Int
computeLongestStreak dates = do
  parsed <- traverse Date.parse dates
  pure (foldl step { last: Nothing, current: 0, longest: 0 } parsed).longest
  where
  step state d =
    let current = case state.last of
          Just previous | Number.round ((Date.getTime d - Date.getTime previous) / 86400000.0) == 1.0 -> state.current + 1
          _ -> 1
    in { last: Just d, current, longest: max current state.longest }

array :: String -> Foreign -> Array Foreign
array key = fromMaybe [] <<< F.readArrayAt key

number :: String -> Foreign -> Number
number key value = fromMaybe 0.0 (F.path key value >>= \v -> case F.asNumber v of
  Just n -> Just n
  Nothing -> F.asString v >>= Number.fromString)

field :: String -> Foreign -> Foreign
field key = fromMaybe F.undefined <<< F.path key

empty :: String -> Window -> Effect Foreign
empty period w = do
  startDate <- Date.toISOString w.startDate
  endDate <- Date.toISOString w.endDate
  pure (F.toForeign { year: w.year, period, startDate, endDate, totalScrobbles: 0, totalListeningTimeMinutes: 0
    , topArtists: [] :: Array Foreign, topTracks: [] :: Array Foreign, topAlbums: [] :: Array Foreign, topGenres: [] :: Array Foreign
    , newArtistsCount: 0, scrobblesPerMonth: [] :: Array Foreign, scrobblesPerDay: [] :: Array Foreign, longestStreak: 0 })

presentation :: String -> Window -> Foreign -> Array Foreign -> Array Foreign -> Array Foreign -> Array Foreign -> Array Foreign -> Effect Foreign
presentation period w summary first last tracks artists albums = do
  base <- empty period w
  longestStreak <- computeLongestStreak (A.mapMaybe (F.readStringAt "date") daily)
  firstScrobble <- scrobble first
  lastScrobble <- scrobble last
  let
    mostActiveDay = case A.head (A.sortBy (\a b -> compare (number "dayCount" b) (number "dayCount" a)) daily) of
      Nothing -> F.undefined
      Just d -> F.toForeign { date: field "date" d, count: number "dayCount" d }
    mostActiveHour = maybeField (F.toForeign <<< number "hour") (A.head (array "hours" summary))
    ranked key idKey rows fields = A.mapMaybe (\item -> do
      id <- F.readStringAt idKey item
      row <- A.find (\r -> F.readStringAt "id" r == Just id) rows
      pure (F.mergeForeign (foldl (\acc k -> F.mergeForeign acc (singleton k (field k row))) (F.toForeign {}) fields)
        (F.toForeign { playCount: number "playCount" item }))) (array key summary)
  pure (F.mergeForeign base (F.toForeign
    { totalScrobbles: number "totalScrobbles" summary
    , totalListeningTimeMinutes: Number.floor (number "totalTime" summary / 60000.0)
    , topTracks: ranked "topTrackIds" "trackId" tracks ["id", "title", "artist", "albumArt", "uri", "artistUri", "albumUri"]
    , topArtists: ranked "topArtistIds" "artistId" artists ["id", "name", "picture", "uri"]
    , topAlbums: ranked "topAlbumIds" "albumId" albums ["id", "title", "artist", "albumArt", "uri"]
    , topGenres: map (\r -> { genre: field "genre" r, count: number "genre_count" r }) (A.filter (\r -> fromMaybe "" (F.readStringAt "genre" r) /= "") (array "topGenres" summary))
    , mostActiveDay, mostActiveHour, newArtistsCount: number "newArtistsCount" summary
    , scrobblesPerMonth: map (\r -> { month: number "month" r, count: number "monthCount" r }) (array "months" summary)
    , scrobblesPerDay: map (\r -> { date: field "date" r, count: number "dayCount" r }) daily
    , firstScrobble, lastScrobble, longestStreak }))
  where
  daily = array "daily" summary
  maybeField f = case _ of
    Just v -> f v
    Nothing -> F.undefined
  singleton k v = F.toForeign (Object.singleton k v)
  scrobble rows = case A.head rows of
    Nothing -> pure F.undefined
    Just r -> do
      timestamp <- Date.toISOString (F.unsafeFromForeign (field "timestamp" r))
      pure (F.toForeign { trackTitle: field "trackTitle" r, artistName: field "artistName" r, timestamp, trackUri: field "trackUri" r })

retrieve :: Context -> Foreign -> Aff Foreign
retrieve ctx params = do
  now <- liftEffect Date.now
  localYear <- liftEffect (Date.getFullYear now)
  let
    period = normalizePeriod (fromMaybe "year" (F.readStringAt "period" params))
    w = periodWindow now period (fromMaybe (Int.round localYear) (F.readIntAt "year" params))
    did = fromMaybe "" (F.readStringAt "did" params)
  users :: Array { id :: String } <- run ctx.readDb (selectFieldsFrom { id: T.usersC.id } T.users
    # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))))
  case A.head users of
    Nothing -> liftEffect (empty period w)
    Just user -> do
      start <- liftEffect (Date.toISOString w.startDate)
      end <- liftEffect (Date.toISOString w.endDate)
      let
        condition = SQL.and (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id))
          (SQL.and (SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.date w.startDate)) (SQL.lt (toSQL T.scrobblesC.timestamp) (SQL.date w.endDate)))
        boundary ordering = runRows ctx.readDb (selectFieldsFrom
          { trackTitle: T.tracksC.title, artistName: T.tracksC.artist, timestamp: T.scrobblesC.timestamp, trackUri: T.tracksC.uri } T.scrobbles
          # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
          # where_ condition # orderBy [ordering (toSQL T.scrobblesC.timestamp)] # limit 1) :: Aff (Array Foreign)
      results <- sequential $ { summary: _, first: _, last: _ }
        <$> parallel (executeRows ctx.readDb (wrappedSummaryQuery user.id start end))
        <*> parallel (boundary identity) <*> parallel (boundary SQL.desc)
      let
        summary = fromMaybe (F.toForeign {}) (A.head results.summary)
        trackIds = A.mapMaybe (F.readStringAt "trackId") (array "topTrackIds" summary)
        artistIds = A.mapMaybe (F.readStringAt "artistId") (array "topArtistIds" summary)
        albumIds = A.mapMaybe (F.readStringAt "albumId") (array "topAlbumIds" summary)
      details <- sequential $ { tracks: _, artists: _, albums: _ }
        <$> parallel (if A.null trackIds then pure [] else runRows ctx.readDb (selectFieldsFrom
          { id: T.tracksC.id, title: T.tracksC.title, artist: T.tracksC.artist, albumArt: T.tracksC.albumArt, uri: T.tracksC.uri, artistUri: T.tracksC.artistUri, albumUri: T.tracksC.albumUri } T.tracks
          # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string trackIds))))
        <*> parallel (if A.null artistIds then pure [] else runRows ctx.readDb (selectFieldsFrom
          { id: T.artistsC.id, name: T.artistsC.name, picture: T.artistsC.picture, uri: T.artistsC.uri } T.artists
          # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string artistIds))))
        <*> parallel (if A.null albumIds then pure [] else runRows ctx.readDb (selectFieldsFrom
          { id: T.albumsC.id, title: T.albumsC.title, artist: T.albumsC.artist, albumArt: T.albumsC.albumArt, uri: T.albumsC.uri } T.albums
          # where_ (SQL.inArray (toSQL T.albumsC.id) (map SQL.string albumIds))))
      liftEffect (presentation period w summary results.first results.last details.tracks details.artists details.albums)

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (timeoutMs 120000 <<< retryTransientDb <<< retrieve ctx) 1800000 200
  Xrpc.method server "app.rocksky.stats.getWrapped"
    { auth: Nothing
    , handler: \input -> do
        now <- liftEffect Date.now
        localYear <- liftEffect (Date.getFullYear now)
        let
          p = F.toForeign (Util.params input :: { did :: String })
          period = normalizePeriod (fromMaybe "year" (F.readStringAt "period" p))
          year = fromMaybe (Int.round localYear) (F.readIntAt "year" p)
          key = F.toForeign { did: field "did" p, year: if period == "year" then F.toForeign year else F.undefined, period }
        fallback <- liftEffect (empty period ((periodWindow now period year) { year = year }))
        Xrpc.Json <$> recoverWith fallback (cached key)
    }

runRows :: forall d. Database d -> SelectQ d -> Aff (Array Foreign)
runRows db q = map (map F.toForeign) (run db q :: Aff (Array {}))
