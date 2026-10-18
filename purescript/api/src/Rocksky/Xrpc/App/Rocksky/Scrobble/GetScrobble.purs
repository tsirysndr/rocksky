module Rocksky.Xrpc.App.Rocksky.Scrobble.GetScrobble (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parTraverse, parallel, sequential)
import Data.Array as A
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), split, trim)
import Data.Traversable (traverse)
import Drizzle.Builder (leftJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.TrackLikes (withLikes)
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Scrobbles (SelectScrobble)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util

type ScrobbleRow = { scrobbles :: SelectScrobble, tracks :: SelectTrack, users :: SelectUser, albums :: SelectAlbum, artists :: Nullable SelectArtist }
type First = { handle :: Nullable String, avatar :: Nullable String, timestamp :: Date.JSDate }

retrieve :: Context -> String -> Maybe String -> Aff Foreign
retrieve ctx uri did = do
  rows :: Array ScrobbleRow <- run ctx.db (selectFieldsFrom
    { scrobbles: tableSQL T.scrobbles, tracks: tableSQL T.tracks, users: tableSQL T.users, albums: tableSQL T.albums, artists: tableSQL T.artists } T.scrobbles
    # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
    # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
    # leftJoin T.albums (SQL.eq (toSQL T.scrobblesC.albumId) (toSQL T.albumsC.id))
    # leftJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
    # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string uri)))
  row <- case A.head rows of
    Nothing -> throwError (error "Failed to retrieve scrobble: Scrobble not found")
    Just value -> pure value
  artists <- A.catMaybes <$> parTraverse (\name -> A.head <$> (run ctx.db (selectFrom T.artists
    # where_ (SQL.eq (toSQL T.artistsC.name) (SQL.string (trim name)))) :: Aff (Array SelectArtist))) (split (Pattern ",") row.tracks.artist)
  let condition = SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string row.tracks.id)
  counts <- sequential $ { likes: _, listeners: _, scrobbles: _, first: _ }
    <$> parallel (withLikes ctx [row.tracks] did (Just <<< _.id))
    <*> parallel (run ctx.db (selectFieldsFrom { count: SQL.countDistinct (toSQL T.scrobblesC.userId) } T.scrobbles
      # leftJoin T.tracks (SQL.eq (toSQL T.tracksC.id) (toSQL T.scrobblesC.trackId))
      # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id)) # where_ condition) :: Aff (Array { count :: Int }))
    <*> parallel (run ctx.db (selectFieldsFrom { count: SQL.count } T.scrobbles
      # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id)) # where_ condition) :: Aff (Array { count :: Int }))
    <*> parallel (run ctx.db (selectFieldsFrom { handle: toSQL T.usersC.handle, avatar: toSQL T.usersC.avatar, timestamp: toSQL T.scrobblesC.timestamp } T.scrobbles
      # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id)) # where_ condition
      # orderBy [SQL.asc (toSQL T.scrobblesC.timestamp)] # limit 1) :: Aff (Array First))
  liftEffect do
    trackArtists <- traverse (\artist -> do
      createdAt <- Date.toISOString artist.createdAt
      updatedAt <- Date.toISOString artist.updatedAt
      pure (F.mergeForeign (F.toForeign artist) (F.toForeign { createdAt, updatedAt }))) artists
    firstScrobble <- case A.head counts.first of
      Nothing -> pure F.undefined
      Just first -> do
        timestamp <- Date.toISOString first.timestamp
        pure (F.toForeign { handle: first.handle, avatar: first.avatar, timestamp })
    date <- Date.toISOString row.scrobbles.timestamp
    createdAt <- Date.toISOString row.scrobbles.createdAt
    updatedAt <- Date.toISOString row.scrobbles.updatedAt
    pure (F.mergeForeign (F.deleteKeys ["albumArt", "id", "albumUri"] (F.toForeign row.tracks)) (F.toForeign
      { mbId: nonempty row.tracks.mbId, isrc: nonempty row.tracks.isrc, artists: trackArtists, albumUri: row.albums.uri
      , trackUri: row.tracks.uri, liked: fromMaybe false (_.liked <$> A.head counts.likes), cover: row.tracks.albumArt
      , date, user: row.users.handle, uri: row.scrobbles.uri, tags: fromMaybe [] (toMaybe row.artists >>= toMaybe <<< _.genres)
      , listeners: fromMaybe 0 (_.count <$> A.head counts.listeners), scrobbles: fromMaybe 0 (_.count <$> A.head counts.scrobbles)
      , createdAt, updatedAt, id: row.scrobbles.id, firstScrobble }))
  where
  nonempty value = case trim <$> toMaybe value of
    Just s | s /= "" -> F.toForeign s
    _ -> F.undefined

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.scrobble.getScrobble"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { uri :: String }
      Xrpc.Json <$> recoverWith (F.toForeign {}) (timeoutMs 10000 (retryTransientDb (retrieve ctx params.uri (Util.authDid input)))) }
