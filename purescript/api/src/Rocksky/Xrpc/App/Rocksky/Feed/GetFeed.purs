module Rocksky.Xrpc.App.Rocksky.Feed.GetFeed (register, getFeed, hydrate, cacheKey) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Set as Set
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, leftJoin, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Record as Record
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.FeedCache (getFeedVersion)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Schema.Scrobbles (SelectScrobble)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Feed.Skeleton as Skeleton
import Rocksky.Xrpc.Util as Util
import Type.Proxy (Proxy(..))

type QueryParams = { feed :: String, limit :: Nullable Int, cursor :: Nullable String }
type FeedRow = { scrobbles :: SelectScrobble, tracks :: SelectTrack, users :: SelectUser, artists :: Nullable { genres :: Nullable (Array String) } }

cacheKey :: QueryParams -> Int -> Maybe String -> String
cacheKey params version did = "feed:getFeed:v2:" <> fromMaybe "anon" did <> ":" <> params.feed <> ":" <> show version <> ":" <> fromMaybe "" (show <$> toMaybe params.limit) <> ":" <> fromMaybe "" (toMaybe params.cursor)

getFeed :: Context -> QueryParams -> Maybe String -> Aff Foreign
getFeed ctx params did = do
  version <- getFeedVersion ctx params.feed
  let key = cacheKey params version did
  cached <- Redis.get ctx.redis key
  case cached of
    Just value | value /= "" -> case F.parseJson value of
      Left e -> throwError (error e)
      Right view -> pure view
    _ -> do
      skeleton <- Skeleton.fetch ctx false params.feed (F.toForeign { limit: params.limit, cursor: params.cursor })
      let data_ = F.unsafeFromForeign skeleton :: { feed :: Array { scrobble :: String }, cursor :: Foreign }
      view <- hydrate ctx (map _.scrobble data_.feed) data_.cursor did
      Redis.setEx ctx.redis key 30 (F.stringify view)
      pure view

hydrate :: Context -> Array String -> Foreign -> Maybe String -> Aff Foreign
hydrate ctx uris cursor did = do
  rows :: Array FeedRow <- run ctx.db (selectFieldsFrom
    { scrobbles: tableSQL T.scrobbles, tracks: Record.delete (Proxy :: Proxy "lyrics") T.tracksC
    , users: { handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar }
    , artists: { genres: toSQL T.artistsC.genres } } T.scrobbles
    # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
    # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
    # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
    # where_ (SQL.inArray (toSQL T.scrobblesC.uri) (map SQL.string uris)) # orderBy [SQL.desc (toSQL T.scrobblesC.timestamp)])
  let ids = A.nub (A.mapMaybe (\row -> F.readStringAt "tracks.id" (F.toForeign row) >>= \id -> if id == "" then Nothing else Just id) rows)
  likes <- if A.null ids then pure { counts: [], liked: [] } else sequential $ { counts: _, liked: _ }
    <$> parallel (run ctx.db (selectFieldsFrom { trackId: toSQL T.lovedTracksC.trackId, count: SQL.count } T.lovedTracks
      # where_ (SQL.inArray (toSQL T.lovedTracksC.trackId) (map SQL.string ids)) # groupBy [toSQL T.lovedTracksC.trackId]) :: Aff (Array { trackId :: String, count :: Int }))
    <*> parallel (case did of
      Nothing -> pure []
      Just viewer -> run ctx.db (selectFieldsFrom { trackId: toSQL T.lovedTracksC.trackId } T.lovedTracks
        # innerJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
        # where_ (SQL.and (SQL.inArray (toSQL T.lovedTracksC.trackId) (map SQL.string ids)) (SQL.eq (toSQL T.usersC.did) (SQL.string viewer)))) :: Aff (Array { trackId :: String }))
  let counts = Map.fromFoldable (map (\row -> Tuple row.trackId row.count) likes.counts)
      liked = Set.fromFoldable (map _.trackId likes.liked)
  feed <- liftEffect (traverse (\row -> do
    date <- Date.toISOString row.scrobbles.timestamp
    createdAt <- Date.toISOString row.scrobbles.createdAt
    updatedAt <- Date.toISOString row.scrobbles.updatedAt
    pure { scrobble: F.mergeForeign (F.deleteKeys ["albumArt", "id"] (F.toForeign row.tracks)) (F.toForeign
      { cover: row.tracks.albumArt, date, user: row.users.handle, userDisplayName: row.users.displayName, userAvatar: row.users.avatar
      , uri: row.scrobbles.uri, tags: fromMaybe F.undefined (F.toForeign <<< _.genres <$> toMaybe row.artists)
      , likesCount: fromMaybe 0 (Map.lookup row.tracks.id counts), liked: Set.member row.tracks.id liked
      , trackUri: row.tracks.uri, createdAt, updatedAt, id: row.scrobbles.id }) }) rows)
  pure (F.toForeign { feed, cursor })

register :: Server -> Context -> Effect Unit
register server ctx = do
  -- Share concurrent work only; Redis still controls expiry and versions.
  pending <- queryCache (\key -> timeoutMs 10000 (retryTransientDb (getFeed ctx key.params key.did))) 0 100
  Xrpc.method server "app.rocksky.feed.getFeed"
    { auth: Just ctx.authVerifier
    , handler: \input -> Xrpc.Json <$> recoverWith (F.toForeign { scrobbles: [] :: Array Foreign })
        (pending { params: Util.params input, did: Util.authDid input }) }
