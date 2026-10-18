-- | app.rocksky.song.getSongRecentListeners
module Rocksky.Xrpc.App.Rocksky.Song.GetSongRecentListeners (register, QueryParams, RecentListener) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Control.Monad.Except (runExcept)
import Data.Array (foldl, head, mapMaybe)
import Data.Either (Either(..), hush)
import Data.JSDate (JSDate, getTime, parse, readDate, toISOString)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, message, throwError, try)
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (asString, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams = { uri :: String, limit :: Nullable Int, offset :: Nullable Int }

type RecentListener =
  { id :: String
  , did :: String
  , handle :: String
  , displayName :: String
  , avatar :: String
  , timestamp :: String
  , scrobbleUri :: String
  }

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache
    (\p -> timeoutMs 10000 $ retryTransientDb $ presentation <$> retrieve ctx p)
    (60 * 1000)
    200
  Xrpc.method server "app.rocksky.song.getSongRecentListeners"
    { auth: Nothing
    , handler: \input -> do
        result <- recoverWith (toForeign { listeners: ([] :: Array RecentListener) }) (cached (params input))
        pure (Json result)
    }

retrieve :: Context -> QueryParams -> Aff (Array RecentListener)
retrieve ctx p = wrap do
  let
    lim = fromMaybe 20 (toMaybe p.limit)
    off = fromMaybe 0 (toMaybe p.offset)
  tracks :: Array { id :: String } <- run ctx.db
    ( selectFieldsFrom { id: toSQL T.tracksC.id } T.tracks
        # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string p.uri))
    )
  case head tracks of
    Nothing -> pure []
    Just { id: trackId } -> do
      latestRows :: Array { userId :: Nullable String, lastTimestamp :: Nullable Foreign } <- run ctx.db
        ( selectFieldsFrom
            { userId: toSQL T.scrobblesC.userId
            , lastTimestamp: SQL.max (toSQL T.scrobblesC.timestamp)
            }
            T.scrobbles
            # where_ (SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string trackId))
            # groupBy [ toSQL T.scrobblesC.userId ]
            # orderBy [ SQL.desc (SQL.max (toSQL T.scrobblesC.timestamp)) ]
            # limit lim
            # offset off
        )
      case latestRows of
        [] -> pure []
        _ -> do
          let userIds = mapMaybe (toMaybe <<< _.userId) latestRows
          users :: Array { id :: String, avatar :: String, did :: String, displayName :: Nullable String, handle :: String } <- run ctx.db
            ( selectFieldsFrom
                { id: toSQL T.usersC.id
                , avatar: toSQL T.usersC.avatar
                , did: toSQL T.usersC.did
                , displayName: toSQL T.usersC.displayName
                , handle: toSQL T.usersC.handle
                }
                T.users
                # where_ (SQL.inArray (toSQL T.usersC.id) (map SQL.string userIds))
            )
          scrobbleRows :: Array { userId :: Nullable String, uri :: Nullable String, timestamp :: JSDate } <- run ctx.db
            ( selectFieldsFrom
                { userId: toSQL T.scrobblesC.userId
                , uri: toSQL T.scrobblesC.uri
                , timestamp: toSQL T.scrobblesC.timestamp
                }
                T.scrobbles
                # where_
                    ( SQL.and
                        (SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string trackId))
                        (SQL.inArray (toSQL T.scrobblesC.userId) (map SQL.string userIds))
                    )
            )
          let
            userMap = Map.fromFoldable (map (\u -> Tuple u.id u) users)
            latestScrobbleByUser = foldl
              ( \m row -> case toMaybe row.userId of
                  Nothing -> m
                  Just uid -> case Map.lookup uid m of
                    Just cur | not (getTime row.timestamp > getTime cur.timestamp) -> m
                    _ -> Map.insert uid { uri: row.uri, timestamp: row.timestamp } m
              )
              Map.empty
              scrobbleRows
          pure $ latestRows # mapMaybe \item -> do
            uid <- toMaybe item.userId
            lastTimestamp <- toMaybe item.lastTimestamp
            u <- Map.lookup uid userMap
            let scrobble = Map.lookup uid latestScrobbleByUser
            pure
              { id: u.id
              , did: u.did
              , handle: u.handle
              , displayName: fromMaybe "" (toMaybe u.displayName)
              , avatar: u.avatar
              , timestamp: unsafePerformEffect (toISOString (toDate lastTimestamp))
              , scrobbleUri: fromMaybe "" (scrobble >>= \s -> toMaybe s.uri)
              }
  where
  wrap act = do
    r <- try act
    case r of
      Left e -> throwError (error ("Failed to retrieve song's recent listeners: " <> message e))
      Right a -> pure a

-- | `new Date(value)`: drizzle may hand the aggregate back as a Date or a string.
toDate :: Foreign -> JSDate
toDate v = case hush (runExcept (readDate v)) of
  Just d -> d
  Nothing -> unsafePerformEffect (parse (fromMaybe "" (asString v)))

presentation :: Array RecentListener -> Foreign
presentation listeners = toForeign { listeners }
