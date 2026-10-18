module Rocksky.Xrpc.App.Rocksky.Song.GetSong (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Consola as Log
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Either (Either(..))
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
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.TrackLikes (withLikes)
import Rocksky.Schema as T
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.Util as Util

type QueryParams = { uri :: Nullable String, mbid :: Nullable String, isrc :: Nullable String, spotifyId :: Nullable String }
type First = { handle :: Nullable String, avatar :: Nullable String, timestamp :: Date.JSDate }

nonempty :: Nullable String -> Maybe String
nonempty value = trim <$> toMaybe value >>= \s -> if s == "" then Nothing else Just s

retrieve :: Context -> QueryParams -> Maybe String -> Aff Foreign
retrieve ctx params did = do
  result <- attempt do
    let uri = nonempty params.uri
        mbid = nonempty params.mbid
        isrc = nonempty params.isrc
        spotify = nonempty params.spotifyId
    when (uri == Nothing && mbid == Nothing && isrc == Nothing && spotify == Nothing)
      (throwError (Xrpc.invalidRequestError "getSong requires one of: uri, mbid, isrc, spotifyId"))
    userTrack <- case uri of
      Nothing -> pure Nothing
      Just value -> do
        rows :: Array { trackId :: Nullable String } <- run ctx.readDb (selectFieldsFrom { trackId: toSQL T.userTracksC.trackId } T.userTracks
          # where_ (SQL.eq (toSQL T.userTracksC.uri) (SQL.string value)) # limit 1)
        pure (_.trackId <$> A.head rows)
    let clauses = A.catMaybes
          [ (SQL.eq (toSQL T.tracksC.id) <<< SQL.param) <$> userTrack
          , (SQL.eq (toSQL T.tracksC.uri) <<< SQL.string) <$> uri
          , (SQL.eq (toSQL T.tracksC.mbId) <<< SQL.string) <$> mbid
          , (SQL.eq (toSQL T.tracksC.isrc) <<< SQL.string) <$> isrc
          , (SQL.eq (toSQL T.tracksC.spotifyLink) <<< SQL.string <<< ("https://open.spotify.com/track/" <> _)) <$> spotify ]
    rows :: Array { tracks :: Nullable SelectTrack, artists :: Nullable SelectArtist } <- run ctx.readDb
      (selectFieldsFrom { tracks: tableSQL T.tracks, artists: tableSQL T.artists } T.tracks
        # leftJoin T.artists (SQL.eq (toSQL T.tracksC.artistUri) (toSQL T.artistsC.uri))
        # where_ (fromMaybe (SQL.raw "false") (SQL.orAll clauses)) # limit 1)
    case A.head rows of
      Just row | Just track <- toMaybe row.tracks -> do
        let names = map trim (split (Pattern ",") track.artist)
        artistRows :: Array SelectArtist <- run ctx.readDb (selectFrom T.artists # where_ (SQL.inArray (toSQL T.artistsC.name) (map SQL.string (A.nub names))))
        let artists = A.mapMaybe (\name -> A.find (\artist -> artist.name == name) artistRows) names
        counts <- sequential $ { likes: _, listeners: _, plays: _, first: _ }
          <$> parallel (withLikes ctx [track] did (Just <<< _.id))
          <*> parallel (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.userTracks
            # where_ (SQL.eq (toSQL T.userTracksC.trackId) (SQL.string track.id))) :: Aff (Array { count :: Int }))
          <*> parallel (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.scrobbles
            # where_ (SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string track.id))) :: Aff (Array { count :: Int }))
          <*> parallel (run ctx.readDb (selectFieldsFrom { handle: toSQL T.usersC.handle, avatar: toSQL T.usersC.avatar, timestamp: toSQL T.scrobblesC.timestamp } T.scrobbles
            # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
            # where_ (SQL.eq (toSQL T.scrobblesC.trackId) (SQL.string track.id))
            # orderBy [SQL.asc (toSQL T.scrobblesC.timestamp)] # limit 1) :: Aff (Array First))
        liftEffect do
          artistViews <- traverse (\artist -> do
            createdAt <- Date.toISOString artist.createdAt
            updatedAt <- Date.toISOString artist.updatedAt
            pure (F.mergeForeign (F.toForeign artist) (F.toForeign { createdAt, updatedAt }))) artists
          firstScrobble <- case A.head counts.first of
            Nothing -> pure F.undefined
            Just first -> do
              timestamp <- Date.toISOString first.timestamp
              pure (F.toForeign { handle: first.handle, avatar: first.avatar, timestamp })
          createdAt <- Date.toISOString track.createdAt
          updatedAt <- Date.toISOString track.updatedAt
          pure (F.mergeForeign (fromMaybe (F.toForeign track) (F.toForeign <$> A.head counts.likes)) (F.toForeign
            { mbId: fromMaybe F.undefined (F.toForeign <$> nonempty track.mbId), isrc: fromMaybe F.undefined (F.toForeign <$> nonempty track.isrc)
            , tags: fromMaybe [] (toMaybe row.artists >>= toMaybe <<< _.genres), artists: artistViews
            , playCount: fromMaybe 0 (_.count <$> A.head counts.plays), uniqueListeners: fromMaybe 0 (_.count <$> A.head counts.listeners)
            , createdAt, updatedAt, firstScrobble }))
      _ -> throwError (Xrpc.invalidRequestNamedError ("Song not found: " <> fromMaybe "undefined"
        ((trim <$> toMaybe params.uri) <|> (trim <$> toMaybe params.mbid) <|> (trim <$> toMaybe params.isrc) <|> (trim <$> toMaybe params.spotifyId))) "NotFound")
  case result of
    Right view -> pure view
    Left e | Xrpc.isInvalidRequestError e -> throwError e
    Left e -> throwError (error ("Failed to retrieve song: " <> describeError e))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.song.getSong"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      result <- attempt (timeoutMs 10000 (retryTransientDb (retrieve ctx (Util.params input) (Util.authDid input))))
      case result of
        Right view -> pure (Xrpc.Json view)
        Left e -> do
          unless (Xrpc.isInvalidRequestError e) (liftEffect (Log.error (describeError e)))
          throwError e }
