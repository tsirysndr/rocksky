module Rocksky.Lib.EventView where

import Prelude
import Atproto.XrpcServer (Auth, credentialsDid, throwInvalidRequest)
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Array (find, foldl, head, index, mapMaybe, null)
import Data.JSDate (JSDate)
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isNothing, maybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.Number as Number
import Data.String (Pattern(..), split, stripPrefix)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, leftJoin, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL (SQL)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (asArray, omitNulls, readNumberAt, readStringAt, toForeign, undefined)
import Rocksky.Schema as T
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.EventArtists (SelectEventArtist)
import Rocksky.Schema.EventRsvps (SelectEventRsvp)
import Rocksky.Schema.Events (SelectEvent)
import Rocksky.Schema.Users (SelectUser)

rsvpGoing :: String
rsvpGoing = "community.lexicon.calendar.rsvp#going"
rsvpInterested :: String
rsvpInterested = "community.lexicon.calendar.rsvp#interested"
rsvpNotGoing :: String
rsvpNotGoing = "community.lexicon.calendar.rsvp#notgoing"

type EventRow = { events :: SelectEvent, users :: SelectUser }
type RsvpCounts = { going :: Int, interested :: Int, notGoing :: Int }

viewerDid :: Nullable Auth -> Maybe String
viewerDid = credentialsDid

toLocationView :: Foreign -> Maybe Foreign
toLocationView raw = do
  kind <- readStringAt "$type" raw
  fields <- case kind of
    "community.lexicon.location.address" -> Just ["country", "postalCode", "region", "locality", "street"]
    "community.lexicon.location.geo" -> Just ["latitude", "longitude", "altitude"]
    "community.lexicon.location.fsq" -> Just ["latitude", "longitude"]
    "community.lexicon.location.hthree" -> Just []
    "community.lexicon.calendar.event#uri" -> Just ["uri"]
    _ -> Nothing
  let entries = mapMaybe (\key -> Tuple key <<< toForeign <$> readStringAt key raw) (["name"] <> fields)
      renamed = case kind of
        "community.lexicon.location.fsq" -> map (\v -> Tuple "fsqPlaceId" (toForeign v)) (readStringAt "fsq_place_id" raw)
        "community.lexicon.location.hthree" -> map (\v -> Tuple "h3" (toForeign v)) (readStringAt "value" raw)
        _ -> Nothing
  pure (toForeign (Object.fromFoldable ([Tuple "type" (toForeign kind)] <> entries <> maybe [] pure renamed)))

toMediaView :: Foreign -> String -> Maybe Foreign
toMediaView raw did = do
  cid <- readStringAt "content.ref.$link" raw
  role <- readStringAt "role" raw
  if cid == "" || role == "" then Nothing else
    Just (omitNulls (toForeign
      { role, url: "https://cdn.bsky.app/img/feed_fullsize/plain/" <> did <> "/" <> cid <> "@jpeg"
      , cid, mimeType: fromMaybe "application/octet-stream" (readStringAt "content.mimeType" raw)
      , size: positive "content.size", width: positive "aspect_ratio.width", height: positive "aspect_ratio.height"
      , alt: toNullable (readStringAt "alt" raw) }))
  where
  positive key = toNullable (readNumberAt key raw >>= \n -> if n > 0.0 && Number.isFinite n && Number.floor n == n then Just n else Nothing)

toUriView :: Foreign -> Maybe Foreign
toUriView raw = do
  uri <- readStringAt "uri" raw
  if uri == "" then Nothing else Just (omitNulls (toForeign { uri, name: toNullable (readStringAt "name" raw) }))

iso :: Nullable JSDate -> Effect (Nullable String)
iso value = toNullable <$> traverse Date.toISOString (toMaybe value)

toArtistView :: SelectEventArtist -> Nullable SelectArtist -> Effect Foreign
toArtistView row artist = do
  startsAt <- iso row.startsAt
  let linked = toMaybe artist
  pure (omitNulls (toForeign
    { id: toNullable (_.id <$> linked), uri: toNullable (linked >>= toMaybe <<< _.uri)
    , sha256: toNullable (_.sha256 <$> linked), name: row.name
    , picture: toNullable (linked >>= toMaybe <<< _.picture)
    , mbid: row.mbid, role: row.role, stage: row.stage, startsAt }))

toRsvpView :: SelectEventRsvp -> SelectUser -> Effect Foreign
toRsvpView row user = do
  createdAt <- Date.toISOString row.createdAt
  pure (omitNulls (toForeign
    { uri: row.uri, cid: row.cid, status: row.status, did: user.did, handle: user.handle
    , displayName: user.displayName, avatar: if user.avatar == "" then undefined else toForeign user.avatar, createdAt }))

toEventView :: EventRow -> Array Foreign -> RsvpCounts -> Maybe String -> Effect Foreign
toEventView { events: event, users: organizer } artists rsvpCounts viewerRsvp = do
  startsAt <- iso event.startsAt
  endsAt <- iso event.endsAt
  createdAt <- Date.toISOString (fromMaybe event.xataCreatedAt (toMaybe event.createdAt))
  updatedAt <- Date.toISOString event.updatedAt
  let values v = fromMaybe [] (toMaybe v >>= asArray)
      media = mapMaybe (\m -> toMediaView m organizer.did) (values event.media)
      thumbnail = find (\m -> readStringAt "role" m == Just "thumbnail") media <|> head media
      imageUrl = toNullable (toMaybe event.imageUrl <|> (thumbnail >>= readStringAt "url"))
  pure (omitNulls (toForeign
    { id: event.id, uri: event.uri, cid: event.cid, musicUri: event.musicUri, musicCid: event.musicCid
    , name: event.name, description: event.description, kind: event.kind, genre: event.genre, tags: event.tags
    , startsAt, endsAt, mode: event.mode, status: event.status, imageUrl, media, ticketsUrl: event.ticketsUrl
    , locations: mapMaybe toLocationView (values event.locations), uris: mapMaybe toUriView (values event.uris)
    , artists, externalIds: event.externalIds, organizerDid: organizer.did, organizerHandle: organizer.handle
    , organizerName: organizer.displayName
    , organizerAvatarUrl: if organizer.avatar == "" then undefined else toForeign organizer.avatar
    , rsvpCounts, viewerRsvp: toNullable viewerRsvp, createdAt, updatedAt }))

rsvpGroup :: SQL
rsvpGroup = SQL.coalesce (toSQL T.eventsC.duplicateOf) (toSQL T.eventsC.id)

emptyCounts :: RsvpCounts
emptyCounts = { going: 0, interested: 0, notGoing: 0 }

hydrateEvents :: Context -> Array EventRow -> Maybe String -> Aff (Array Foreign)
hydrateEvents ctx rows viewer
  | null rows = pure []
  | otherwise = do
    let ids = map (SQL.string <<< _.id <<< _.events) rows
    data_ <- sequential $ { lineup: _, tallies: _, viewerRsvps: _ }
      <$> parallel (run ctx.db
        (selectFieldsFrom { entry: tableSQL T.eventArtists, artist: tableSQL T.artists } T.eventArtists
          # leftJoin T.artists (SQL.eq (toSQL T.eventArtistsC.artistId) (toSQL T.artistsC.id))
          # where_ (SQL.inArray (toSQL T.eventArtistsC.eventId) ids)
          # orderBy [SQL.asc (toSQL T.eventArtistsC.position)]) :: Aff (Array { entry :: SelectEventArtist, artist :: Nullable SelectArtist }))
      <*> parallel (run ctx.db
        (selectFieldsFrom { eventId: SQL.as "event_id" rsvpGroup, status: toSQL T.eventRsvpsC.status, count: SQL.raw "count(*)::int" } T.eventRsvps
          # innerJoin T.events (SQL.eq (toSQL T.eventRsvpsC.eventId) (toSQL T.eventsC.id))
          # where_ (SQL.inArray rsvpGroup ids)
          # groupBy [rsvpGroup, toSQL T.eventRsvpsC.status]) :: Aff (Array { eventId :: String, status :: String, count :: Int }))
      <*> parallel (case viewer of
        Just did | did /= "" -> run ctx.db
          (selectFieldsFrom { eventId: SQL.as "event_id" rsvpGroup, status: toSQL T.eventRsvpsC.status } T.eventRsvps
            # innerJoin T.events (SQL.eq (toSQL T.eventRsvpsC.eventId) (toSQL T.eventsC.id))
            # innerJoin T.users (SQL.eq (toSQL T.eventRsvpsC.userId) (toSQL T.usersC.id))
            # where_ (SQL.and (SQL.inArray rsvpGroup ids) (SQL.eq (toSQL T.usersC.did) (SQL.string did))))
        _ -> pure [] :: Aff (Array { eventId :: String, status :: String }))
    lineup <- liftEffect (traverse (\{ entry, artist } -> { eventId: entry.eventId, view: _ } <$> toArtistView entry artist) data_.lineup)
    let artists = foldl (\acc row -> Map.insert row.eventId (fromMaybe [] (Map.lookup row.eventId acc) <> [row.view]) acc) Map.empty lineup
        counts = foldl tally Map.empty data_.tallies
        viewers = Map.fromFoldable (map (\row -> Tuple row.eventId row.status) data_.viewerRsvps)
    liftEffect (traverse (\row -> toEventView row
      (fromMaybe [] (Map.lookup row.events.id artists))
      (fromMaybe emptyCounts (Map.lookup row.events.id counts))
      (Map.lookup row.events.id viewers)) rows)
  where
  tally acc { eventId, status, count } =
    let old = fromMaybe emptyCounts (Map.lookup eventId acc)
        next
          | status == rsvpGoing = old { going = old.going + count }
          | status == rsvpInterested = old { interested = old.interested + count }
          | status == rsvpNotGoing = old { notGoing = old.notGoing + count }
          | otherwise = old
    in Map.insert eventId next acc

canonicalAtUri :: Context -> String -> Aff String
canonicalAtUri ctx uri = do
  let parts = split (Pattern "/") (fromMaybe uri (stripPrefix (Pattern "at://") uri))
      authority = fromMaybe "" (index parts 0)
      collection = fromMaybe "" (index parts 1)
      rkey = fromMaybe "" (index parts 2)
  if authority == "" || isJustPrefix authority || rkey == "" then pure uri else do
    rows :: Array { did :: String } <- run ctx.db (selectFieldsFrom { did: toSQL T.usersC.did } T.users
      # where_ (SQL.eq (toSQL T.usersC.handle) (SQL.string authority)) # limit 1)
    pure (maybe uri (\user -> "at://" <> user.did <> "/" <> collection <> "/" <> rkey) (head rows))
  where
  isJustPrefix s = not (isNothing (stripPrefix (Pattern "did:") s))

findEvent :: Context -> String -> Aff (Maybe EventRow)
findEvent ctx uri = do
  canonical <- canonicalAtUri ctx uri
  rows :: Array EventRow <- run ctx.db (base # where_ (SQL.or
    (SQL.eq (toSQL T.eventsC.uri) (SQL.string canonical))
    (SQL.eq (toSQL T.eventsC.musicUri) (SQL.string canonical))) # limit 1)
  case head rows of
    Just row -> case toMaybe row.events.duplicateOf of
      Just id | id /= "" -> do
        canonicalRows <- run ctx.db (base # where_ (SQL.eq (toSQL T.eventsC.id) (SQL.string id)) # limit 1)
        pure (head canonicalRows <|> Just row)
      _ -> pure (Just row)
    Nothing -> pure Nothing
  where
  base = selectFieldsFrom { events: tableSQL T.events, users: tableSQL T.users } T.events
    # innerJoin T.users (SQL.eq (toSQL T.eventsC.createdBy) (toSQL T.usersC.id))

eventGroupIds :: String -> SQL
eventGroupIds eventId = SQL.template ["(SELECT ", " FROM ", " WHERE ", " = ", " OR ", " = ", ")"]
  [toSQL T.eventsC.id, tableSQL T.events, toSQL T.eventsC.id, SQL.string eventId, toSQL T.eventsC.duplicateOf, SQL.string eventId]

type EventFilters =
  { artist :: Nullable String, did :: Nullable String, rsvpBy :: Nullable String
  , kind :: Nullable String, genre :: Nullable String, from :: Nullable String, to :: Nullable String
  , includePast :: Nullable Boolean, limit :: Int, offset :: Int }

parseDate :: Nullable String -> String -> Aff (Maybe JSDate)
parseDate value name = case toMaybe value of
  Nothing -> pure Nothing
  Just s -> do
    date <- liftEffect (Date.parse s)
    if Number.isNaN (Date.getTime date) then throwInvalidRequest ("`" <> name <> "` is not a valid datetime") else pure (Just date)

startOfToday :: JSDate -> Effect JSDate
startOfToday now = pure $ Date.fromTime (Number.floor (Date.getTime now / 86400000.0) * 86400000.0)

eventConditions :: EventFilters -> Aff { where_ :: SQL, order :: SQL }
eventConditions filters = do
  from <- parseDate filters.from "from"
  to <- parseDate filters.to "to"
  today <- liftEffect (Date.now >>= startOfToday)
  let past = fromMaybe false (toMaybe filters.includePast)
      upcomingOnly = isNothing from && isNothing to && not past
      lowerBound = from <|> if upcomingOnly then Just today else Nothing
      optional value f = case toMaybe value of
        Just s | s /= "" -> [f s]
        _ -> []
      conditions = [SQL.isNull (toSQL T.eventsC.duplicateOf)]
        <> optional filters.artist artistMatches
        <> optional filters.did (SQL.eq (toSQL T.usersC.did) <<< SQL.string)
        <> optional filters.rsvpBy rsvpBy
        <> optional filters.kind (SQL.eq (toSQL T.eventsC.kind) <<< SQL.string)
        <> optional filters.genre (\genre -> SQL.eq (SQL.lower (toSQL T.eventsC.genre)) (SQL.lower (SQL.string genre)))
        <> maybe [] (\bound -> [SQL.or (SQL.isNull (toSQL T.eventsC.startsAt)) (SQL.gte (SQL.coalesce (toSQL T.eventsC.endsAt) (toSQL T.eventsC.startsAt)) (SQL.date bound))]) lowerBound
        <> maybe [] (\bound -> [SQL.lte (toSQL T.eventsC.startsAt) (SQL.date bound)]) to
  pure
    { where_: fromMaybe (SQL.raw "true") (SQL.andAll conditions)
    , order: SQL.template ["", if past && isNothing from then " DESC NULLS LAST" else " ASC NULLS LAST"] [toSQL T.eventsC.startsAt] }
  where
  artistMatches artist = SQL.exists (SQL.template
    ["(SELECT 1 FROM ", " JOIN ", " ON ", " = ", " WHERE ", " = ", " AND (", " = ", " OR ", " = ", " OR ", " = ", "))"]
    [tableSQL T.eventArtists, tableSQL T.artists, toSQL T.artistsC.id, toSQL T.eventArtistsC.artistId
    , toSQL T.eventArtistsC.eventId, toSQL T.eventsC.id, toSQL T.artistsC.uri, SQL.string artist
    , toSQL T.artistsC.id, SQL.string artist, toSQL T.artistsC.sha256, SQL.string artist])
  rsvpBy did = SQL.exists (SQL.template
    ["(SELECT 1 FROM ", " JOIN ", " AS attended ON attended.xata_id = ", " JOIN ", " AS attendee ON attendee.xata_id = ", " WHERE coalesce(attended.duplicate_of, attended.xata_id) = ", " AND attendee.did = ", " AND ", " IN (", ", ", "))"]
    [tableSQL T.eventRsvps, tableSQL T.events, toSQL T.eventRsvpsC.eventId, tableSQL T.users, toSQL T.eventRsvpsC.userId
    , toSQL T.eventsC.id, SQL.string did, toSQL T.eventRsvpsC.status, SQL.string rsvpGoing, SQL.string rsvpInterested])

listEvents :: Context -> EventFilters -> Maybe String -> Aff (Array Foreign)
listEvents ctx filters viewer = do
  conditions <- eventConditions filters
  rows <- run ctx.db (selectFieldsFrom { events: tableSQL T.events, users: tableSQL T.users } T.events
    # innerJoin T.users (SQL.eq (toSQL T.eventsC.createdBy) (toSQL T.usersC.id))
    # where_ conditions.where_ # orderBy [conditions.order, SQL.asc (toSQL T.eventsC.id)]
    # limit filters.limit # offset filters.offset)
  hydrateEvents ctx rows viewer
