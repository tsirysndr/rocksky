module Rocksky.Xrpc.App.Rocksky.Scrobble.GetScrobbles (register, getScrobbles, retrieveWithDb, fetchScrobbles, cacheKey, filterFields) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array as A
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Set as Set
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (innerJoin, leftJoin, limit, offset, orderBy, querySQL, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Record as Record
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.FeedCache (getScrobblesVersion)
import Rocksky.Lib.FilteredPage (filteredPage)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.ScrobbleLikes as ScrobbleLikes
import Rocksky.Lib.Rsql (RsqlFieldMap, RsqlFieldType(..), compileRsqlFilterParam, field)
import Rocksky.Schema as T
import Rocksky.Schema.Scrobbles (SelectScrobble)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util
import Type.Proxy (Proxy(..))

type QueryParams = { did :: Nullable String, following :: Nullable Boolean, limit :: Nullable Int, offset :: Nullable Int, filter :: Nullable String }
type FeedRow = { scrobbles :: SelectScrobble, tracks :: SelectTrack, users :: SelectUser, artists :: Nullable { genres :: Nullable (Array String) } }

filterFields :: RsqlFieldMap
filterFields = Object.fromFoldable
  [ Tuple "uri" (field (toSQL T.scrobblesC.uri))
  , Tuple "date" { column: toSQL T.scrobblesC.timestamp, type_: DateField }, Tuple "timestamp" { column: toSQL T.scrobblesC.timestamp, type_: DateField }
  , Tuple "title" (field (toSQL T.tracksC.title)), Tuple "artist" (field (toSQL T.tracksC.artist)), Tuple "album" (field (toSQL T.tracksC.album))
  , Tuple "track.title" (field (toSQL T.tracksC.title)), Tuple "track.artist" (field (toSQL T.tracksC.artist)), Tuple "track.album" (field (toSQL T.tracksC.album))
  , Tuple "track.albumArtist" (field (toSQL T.tracksC.albumArtist)), Tuple "track.genre" (field (toSQL T.tracksC.genre))
  , Tuple "track.duration" { column: toSQL T.tracksC.duration, type_: NumberField }
  , Tuple "track.isrc" (field (toSQL T.tracksC.isrc)), Tuple "track.mbId" (field (toSQL T.tracksC.mbId))
  , Tuple "user.did" (field (toSQL T.usersC.did)), Tuple "user.handle" (field (toSQL T.usersC.handle)), Tuple "user.displayName" (field (toSQL T.usersC.displayName))
  , Tuple "artist.name" (field (toSQL T.artistsC.name)), Tuple "artist.genres" { column: toSQL T.artistsC.genres, type_: StringArrayField } ]

cacheKey :: QueryParams -> Int -> String
cacheKey params version = "scrobbles:getScrobbles:v2:" <> show version <> ":" <> fromMaybe "anon" (toMaybe params.did) <> ":"
  <> (if toMaybe params.following == Just true then "1" else "0") <> ":" <> fromMaybe "" (show <$> toMaybe params.limit) <> ":"
  <> fromMaybe "" (show <$> toMaybe params.offset) <> ":" <> fromMaybe "" (toMaybe params.filter)

getScrobbles :: Context -> QueryParams -> Aff Foreign
getScrobbles ctx params = do
  version <- getScrobblesVersion ctx
  let key = cacheKey params version
  cached <- Redis.get ctx.redis key
  case cached of
    Just value | value /= "" -> case F.parseJson value of
      Left e -> throwError (error e)
      Right result -> pure result
    _ -> do
      view <- dbQuery ctx.pools "Failed to retrieve scrobbles" \db -> retrieveWithDb (ctx { db = db }) params
      Redis.setEx ctx.redis key 30 (F.stringify view)
      pure view

retrieveWithDb :: Context -> QueryParams -> Aff Foreign
retrieveWithDb ctx params = do
  let did = toMaybe params.did >>= \value -> if value == "" then Nothing else Just value
  users <- case did of
    Just viewer | toMaybe params.following == Just true -> do
      rows :: Array { userId :: String } <- run ctx.db (selectFieldsFrom { userId: toSQL T.usersC.id } T.follows
        # innerJoin T.users (SQL.eq (toSQL T.usersC.did) (toSQL T.followsC.subject_did))
        # where_ (SQL.eq (toSQL T.followsC.follower_did) (SQL.string viewer)))
      pure (Just (map _.userId rows))
    _ -> pure Nothing
  rows <- if users == Just [] then pure [] else fetchScrobbles ctx params users
  enrich ctx rows did

fetchScrobbles :: Context -> QueryParams -> Maybe (Array String) -> Aff (Array FeedRow)
fetchScrobbles ctx params users = do
  filter <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  let
    condition = SQL.andAll (A.catMaybes [map (SQL.inArray (toSQL T.scrobblesC.userId) <<< map SQL.string) users, filter])
    joins query = query
      # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
      # leftJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
    base = joins (selectFieldsFrom
      { scrobbles: tableSQL T.scrobbles, tracks: Record.delete (Proxy :: Proxy "lyrics") T.tracksC
      , users: { handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar }
      , artists: { genres: toSQL T.artistsC.genres } } T.scrobbles)
    orDefault fallback value = case toMaybe value of
      Just n | n /= 0 -> n
      _ -> fallback
    size = orDefault 20 params.limit
    start = orDefault 0 params.offset
  case filter of
    Just _ -> do
      let candidates = joins (selectFieldsFrom
            { id: SQL.as "id" (SQL.template ["", ""] [toSQL T.scrobblesC.id])
            , created_at: SQL.as "created_at" (SQL.template ["", ""] [toSQL T.scrobblesC.timestamp]) } T.scrobbles)
            # maybe identity where_ condition
      ids <- filteredPage ctx.db (querySQL ctx.db candidates) size start
      if A.null ids then pure [] else run ctx.db (base # where_ (SQL.inArray (toSQL T.scrobblesC.id) (map SQL.string ids))
        # orderBy [SQL.desc (toSQL T.scrobblesC.timestamp), toSQL T.scrobblesC.id])
    Nothing -> run ctx.db (base # maybe identity where_ condition # orderBy [SQL.desc (toSQL T.scrobblesC.timestamp)] # offset start # limit size)

enrich :: Context -> Array FeedRow -> Maybe String -> Aff Foreign
enrich ctx rows did = do
  let ids = A.nub (A.mapMaybe (\row -> F.readStringAt "tracks.id" (F.toForeign row) >>= \id -> if id == "" then Nothing else Just id) rows)
  likes <- ScrobbleLikes.retrieve ctx ids did
  let counts = Map.fromFoldable (map (\row -> Tuple row.trackId row.count) likes.counts)
      liked = Set.fromFoldable (map _.trackId likes.liked)
  scrobbles <- liftEffect (traverse (\row -> do
    date <- Date.toISOString row.scrobbles.timestamp
    pure (F.mergeForeign (F.deleteKeys ["albumArt", "id", "createdAt"] (F.toForeign row.tracks)) (F.toForeign
      { cover: row.tracks.albumArt, date, user: row.users.handle, userDisplayName: row.users.displayName, userAvatar: row.users.avatar
      , uri: row.scrobbles.uri, tags: fromMaybe F.undefined (F.toForeign <<< _.genres <$> toMaybe row.artists)
      , likesCount: fromMaybe 0 (Map.lookup row.tracks.id counts), liked: Set.member row.tracks.id liked
      , trackUri: row.tracks.uri, createdAt: date, id: row.scrobbles.id }))) rows)
  pure (F.toForeign { scrobbles })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.scrobble.getScrobbles"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: QueryParams
      void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
      Xrpc.Json <$> recoverWith (F.toForeign { scrobbles: [] :: Array Foreign }) (timeoutMs 20000 (getScrobbles ctx params)) }
