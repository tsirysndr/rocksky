-- | app.rocksky.actor.getActorScrobbles
module Rocksky.Xrpc.App.Rocksky.Actor.GetActorScrobbles (register, QueryParams) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (innerJoin, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Data.JSDate (JSDate, toISOString)
import Data.String (Pattern(..), stripSuffix)
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.TrackLikes (withLikes)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (authDid, params)

type QueryParams = { did :: String, limit :: Nullable Int, offset :: Nullable Int }

type Row =
  { id :: String
  , track_id :: Nullable String
  , title :: String
  , artist :: String
  , album_artist :: String
  , album_art :: Nullable String
  , album :: String
  , handle :: String
  , did :: String
  , avatar :: String
  , uri :: Nullable String
  , track_uri :: Nullable String
  , artist_uri :: Nullable String
  , album_uri :: Nullable String
  , created_at :: JSDate
  , timestamp :: JSDate
  }

type Scrobble =
  { id :: String
  , liked :: Boolean
  , track_id :: Nullable String
  , title :: String
  , artist :: String
  , album_artist :: String
  , album_art :: Nullable String
  , album :: String
  , handle :: String
  , did :: String
  , avatar :: String
  , uri :: Nullable String
  , track_uri :: Nullable String
  , artist_uri :: Nullable String
  , album_uri :: Nullable String
  , created_at :: String
  , timestamp :: String
  }

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.actor.getActorScrobbles"
    -- Optional: authVerifier returns {} without a token, so this stays public —
    -- a DID just means `liked` can be filled in.
    { auth: Just ctx.authVerifier
    , handler: \input -> do
        result <- recoverWith (toForeign { scrobbles: ([] :: Array Foreign) })
          $ timeoutMs 120000
          $ retryTransientDb
          $ presentation <$> retrieve ctx (params input) (authDid input)
        pure (Json result)
    }

retrieve :: Context -> QueryParams -> Maybe String -> Aff (Array Scrobble)
retrieve ctx p did = dbQuery ctx.pools "Failed to retrieve scrobbles" \db -> do
  let
    lim = fromMaybe 50 (toMaybe p.limit)
    off = fromMaybe 0 (toMaybe p.offset)
  -- Resolve the actor before reading scrobbles. Filtering through the users
  -- join lets PostgreSQL walk the global timestamp index until it finds this
  -- listener, which can time out even for a tiny page on a quiet profile.
  users :: Array { id :: String } <- run db
    ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string p.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string p.did)))
        # limit 1
    )
  case users of
    [ user ] -> do
      rows :: Array Row <- run db
        ( selectFieldsFrom
            { id: toSQL T.scrobblesC.id
            , track_id: toSQL T.scrobblesC.trackId
            , title: toSQL T.tracksC.title
            , artist: toSQL T.tracksC.artist
            , album_artist: toSQL T.tracksC.albumArtist
            , album_art: toSQL T.tracksC.albumArt
            , album: toSQL T.tracksC.album
            , handle: toSQL T.usersC.handle
            , did: toSQL T.usersC.did
            , avatar: toSQL T.usersC.avatar
            , uri: toSQL T.scrobblesC.uri
            , track_uri: toSQL T.tracksC.uri
            , artist_uri: toSQL T.tracksC.artistUri
            , album_uri: toSQL T.tracksC.albumUri
            , created_at: toSQL T.scrobblesC.timestamp
            , timestamp: toSQL T.scrobblesC.timestamp
            }
            T.scrobbles
            # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
            # innerJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
            # where_ (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id))
            -- id breaks ties: scrobbles can share a timestamp, and without a
            -- unique key OFFSET pages overlap and skip.
            # orderBy [ SQL.desc (toSQL T.scrobblesC.timestamp), SQL.desc (toSQL T.scrobblesC.id) ]
            # limit lim
            # offset off
        )
      -- Keyed on track_id — `id` here is the scrobble, not the song.
      withLiked <- withLikes ctx rows did (toMaybe <<< _.track_id)
      liftEffect $ withLiked # traverse \r -> do
        createdAt <- toISOString r.created_at
        timestamp <- toISOString r.timestamp
        pure
          { id: r.id
          , liked: r.liked
          , track_id: r.track_id
          , title: r.title
          , artist: r.artist
          , album_artist: r.album_artist
          , album_art: r.album_art
          , album: r.album
          , handle: r.handle
          , did: r.did
          , avatar: r.avatar
          , uri: r.uri
          , track_uri: r.track_uri
          , artist_uri: r.artist_uri
          , album_uri: r.album_uri
          , created_at: fromMaybe createdAt (stripSuffix (Pattern "Z") createdAt)
          , timestamp
          }
    _ -> pure []

presentation :: Array Scrobble -> Foreign
presentation data_ = toForeign
  { scrobbles: data_ <#> \x ->
      { id: x.id
      , trackId: x.track_id
      , title: x.title
      , artist: x.artist
      , albumArtist: x.album_artist
      , albumArt: x.album_art
      , album: x.album
      , handle: x.handle
      , did: x.did
      , avatar: x.avatar
      , uri: x.uri
      , trackUri: x.track_uri
      , liked: x.liked
      , artistUri: x.artist_uri
      , albumUri: x.album_uri
      , createdAt: x.timestamp
      }
  }
