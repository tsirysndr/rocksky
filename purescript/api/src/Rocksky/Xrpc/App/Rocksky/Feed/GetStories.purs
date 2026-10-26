module Rocksky.Xrpc.App.Rocksky.Feed.GetStories (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array as A
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, leftJoin, limit, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Xrpc.App.Rocksky.Feed.Skeleton as Skeleton
import Rocksky.Xrpc.Util as Util

type QueryParams = { feed :: Nullable String, following :: Nullable Boolean, size :: Nullable Int }
type Story =
  { xataId :: String, trackId :: Nullable String, title :: Nullable String, artist :: Nullable String, albumArtist :: Nullable String
  , album :: Nullable String, albumArt :: Nullable String, handle :: Nullable String, did :: Nullable String, avatar :: Nullable String
  , uri :: Nullable String, trackUri :: Nullable String, artistUri :: Nullable String, albumUri :: Nullable String, timestamp :: Date.JSDate }

retrieve :: Context -> QueryParams -> Maybe String -> Aff Foreign
retrieve ctx params did = do
  uris <- case toMaybe params.feed of
    Just feed | feed /= "" -> do
      skeleton <- Skeleton.fetch ctx true feed (F.toForeign {})
      let data_ = F.unsafeFromForeign skeleton :: { feed :: Array { scrobble :: String } }
      pure (Just (map _.scrobble data_.feed))
    _ -> pure Nothing
  following <- if uris == Just [] then pure Nothing else if toMaybe params.following == Just true then case did of
    Just viewer -> do
      users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.follows
        # innerJoin T.users (SQL.eq (toSQL T.usersC.did) (toSQL T.followsC.subject_did))
        # where_ (SQL.eq (toSQL T.followsC.follower_did) (SQL.string viewer)))
      pure (Just (map _.id users))
    Nothing -> pure Nothing
    else pure Nothing
  if uris == Just [] || following == Just [] then pure (F.toForeign { stories: [] :: Array Foreign }) else do
    let
      size = case toMaybe params.size of
        Just n | n /= 0 -> n
        _ -> 20
      fetchRows windowDays = do
        let filters = A.catMaybes
              [ map (SQL.inArray (SQL.raw "inner_s.uri") <<< map SQL.string) uris
              , map (SQL.inArray (SQL.raw "inner_s.user_id") <<< map SQL.string) following
              , if windowDays > 0 then Just (SQL.template ["inner_s.timestamp > now() - make_interval(days => ", ")"] [SQL.int windowDays]) else Nothing ]
            innerWhere = if A.null filters then SQL.empty else SQL.template ["WHERE ", ""] [SQL.join (SQL.raw " AND ") filters]
        run ctx.db (selectFieldsFrom
          { xataId: toSQL T.scrobblesC.id, trackId: toSQL T.tracksC.id, title: toSQL T.tracksC.title, artist: toSQL T.tracksC.artist
          , albumArtist: toSQL T.tracksC.albumArtist, album: toSQL T.tracksC.album, albumArt: toSQL T.tracksC.albumArt
          , handle: toSQL T.usersC.handle, did: toSQL T.usersC.did, avatar: toSQL T.usersC.avatar, uri: toSQL T.scrobblesC.uri
          , trackUri: toSQL T.tracksC.uri, artistUri: toSQL T.artistsC.uri, albumUri: toSQL T.albumsC.uri, timestamp: toSQL T.scrobblesC.timestamp } T.scrobbles
          # leftJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
          # leftJoin T.albums (SQL.eq (toSQL T.scrobblesC.albumId) (toSQL T.albumsC.id))
          # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
          # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
          # where_ (SQL.template ["", " IN (SELECT DISTINCT ON (inner_s.user_id) inner_s.xata_id FROM scrobbles inner_s ", " ORDER BY inner_s.user_id, inner_s.timestamp DESC, inner_s.xata_id DESC)"] [toSQL T.scrobblesC.id, innerWhere])
          # orderBy [SQL.desc (toSQL T.scrobblesC.timestamp)] # limit size) :: Aff (Array Story)
    -- The feed service already bounds the candidates. Include older entries
    -- in one query instead of retrying when there are fewer unique users.
    rows <- case uris of
      Just _ -> fetchRows 0
      Nothing -> do
        recent <- fetchRows 3
        recent <- if A.length recent < size then fetchRows 30 else pure recent
        if A.length recent < size then fetchRows 0 else pure recent
    let ids = A.filter (_ /= "") (A.mapMaybe (toMaybe <<< _.trackId) rows)
    likes :: Array { trackId :: String, count :: Int, liked :: Boolean } <- if A.null ids then pure [] else run ctx.db
      (selectFieldsFrom { trackId: toSQL T.lovedTracksC.trackId, count: SQL.raw "count(*)::int"
        , liked: case did of
            Nothing -> SQL.raw "false"
            Just viewer -> SQL.template ["coalesce(bool_or(", " = ", "), false)"] [toSQL T.usersC.did, SQL.string viewer] } T.lovedTracks
        # leftJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
        # where_ (SQL.inArray (toSQL T.lovedTracksC.trackId) (map SQL.string ids)) # groupBy [toSQL T.lovedTracksC.trackId])
    let byId = Map.fromFoldable (map (\like -> Tuple like.trackId like) likes)
    stories <- liftEffect (traverse (\row -> do
      createdAt <- Date.toISOString row.timestamp
      let like = toMaybe row.trackId >>= flip Map.lookup byId
      pure (F.toForeign
        { album: row.album, albumArt: row.albumArt, albumArtist: row.albumArtist, albumUri: row.albumUri
        , artist: row.artist, artistUri: row.artistUri, avatar: row.avatar, createdAt, did: row.did, handle: row.handle
        , id: row.trackId, title: row.title, trackId: row.trackId, trackUri: row.trackUri, uri: row.uri
        , liked: fromMaybe false (_.liked <$> like), likesCount: fromMaybe 0 (_.count <$> like) })) rows)
    pure (F.toForeign { stories })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.feed.getStories"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: QueryParams
          did = Util.authDid input
      when (toMaybe params.following == Just true && did == Nothing)
        (throwError (error "Authentication required when filtering by following"))
      -- The source evaluates Cache.make for each call, so entries do not
      -- survive requests despite its 30-second TTL configuration.
      Xrpc.Json <$> recoverWith (F.toForeign {}) (timeoutMs 120000 (retryTransientDb (retrieve ctx params did))) }
