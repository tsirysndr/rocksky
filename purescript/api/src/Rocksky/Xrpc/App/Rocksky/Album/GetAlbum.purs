module Rocksky.Xrpc.App.Rocksky.Album.GetAlbum (register, getAlbum, discogsRelations) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, null, toMaybe, toNullable)
import Data.Traversable (traverse)
import Drizzle.Builder (leftJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Common (dedupeTracksKeepLyrics)
import Rocksky.Lib.DiscogsView (DiscogsRelations, toDiscogsView)
import Rocksky.Lib.Error (errorName, logError)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Lib.TrackLikes (withLikes)
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.DiscogsReleases (SelectDiscogsRelease)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.App.Rocksky.Album.GetAlbumTracks (presentTrack)
import Rocksky.Xrpc.Util as Util

discogsRelations :: Context -> SelectDiscogsRelease -> Aff DiscogsRelations
discogsRelations ctx release = sequential $ { credits: _, tracklist: _, labels: _, identifiers: _, artists: _, master: _ }
  <$> parallel (run ctx.readDb (selectFrom T.discogsCredits # where_ (SQL.eq (toSQL T.discogsCreditsC.releaseId) (SQL.string release.id)) # orderBy [SQL.asc (toSQL T.discogsCreditsC.position)]))
  <*> parallel (run ctx.readDb (selectFrom T.discogsTracks # where_ (SQL.eq (toSQL T.discogsTracksC.releaseId) (SQL.string release.id)) # orderBy [SQL.asc (toSQL T.discogsTracksC.idx)]))
  <*> parallel (run ctx.readDb (selectFrom T.discogsReleaseLabels # where_ (SQL.eq (toSQL T.discogsReleaseLabelsC.releaseId) (SQL.string release.id)) # orderBy [SQL.asc (toSQL T.discogsReleaseLabelsC.kind), SQL.asc (toSQL T.discogsReleaseLabelsC.position)]))
  <*> parallel (run ctx.readDb (selectFrom T.discogsIdentifiers # where_ (SQL.eq (toSQL T.discogsIdentifiersC.releaseId) (SQL.string release.id)) # orderBy [SQL.asc (toSQL T.discogsIdentifiersC.position)]))
  <*> parallel (run ctx.readDb (selectFrom T.discogsReleaseArtists # where_ (SQL.eq (toSQL T.discogsReleaseArtistsC.releaseId) (SQL.string release.id)) # orderBy [SQL.asc (toSQL T.discogsReleaseArtistsC.position)]))
  <*> parallel (case toMaybe release.masterId of
    Just id | id /= 0 -> toNullable <<< head <$> run ctx.readDb (selectFrom T.discogsMasters # where_ (SQL.eq (toSQL T.discogsMastersC.discogsId) (SQL.int id)) # limit 1)
    _ -> pure null)

getAlbum :: Context -> String -> Maybe String -> Aff Foreign
getAlbum ctx uri did = do
  result <- attempt do
    rows :: Array { albums :: SelectAlbum, artists :: Nullable SelectArtist, discogs_releases :: Nullable SelectDiscogsRelease } <- run ctx.readDb
      (selectFieldsFrom { albums: tableSQL T.albums, artists: tableSQL T.artists, discogs_releases: tableSQL T.discogsReleases } T.albums
        # leftJoin T.artists (SQL.eq (toSQL T.albumsC.artistUri) (toSQL T.artistsC.uri))
        # leftJoin T.discogsReleases (SQL.eq (toSQL T.albumsC.discogsReleaseId) (toSQL T.discogsReleasesC.id))
        # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string uri)))
    row <- case head rows of
      Nothing -> throwError (Xrpc.invalidRequestNamedError ("Album not found: " <> uri) "NotFound")
      Just row -> pure row
    details <- sequential $ { relations: _, tracks: _, uniqueListeners: _, playCount: _ }
      <$> parallel (case toMaybe row.discogs_releases of
        Nothing -> pure { credits: [], tracklist: [], labels: [], identifiers: [], artists: [], master: null }
        Just release -> discogsRelations ctx release)
      <*> parallel (do
        trackRows :: Array { tracks :: SelectTrack } <- run ctx.readDb
          (selectFieldsFrom { tracks: tableSQL T.tracks } T.albumTracks
            # leftJoin T.tracks (SQL.eq (toSQL T.albumTracksC.trackId) (toSQL T.tracksC.id))
            # where_ (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string row.albums.id))
            # orderBy [SQL.asc (toSQL T.tracksC.discNumber), SQL.asc (toSQL T.tracksC.trackNumber)])
        liked <- withLikes ctx (dedupeTracksKeepLyrics (map _.tracks trackRows)) did (Just <<< _.id)
        liftEffect (traverse presentTrack liked))
      <*> parallel (countRows <$> (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.userAlbums # where_ (SQL.eq (toSQL T.userAlbumsC.albumId) (SQL.string row.albums.id))) :: Aff (Array { count :: Int })))
      <*> parallel (countRows <$> (run ctx.readDb (selectFieldsFrom { count: SQL.count } T.scrobbles # where_ (SQL.eq (toSQL T.scrobblesC.albumId) (SQL.string row.albums.id))) :: Aff (Array { count :: Int })))
    createdAt <- liftEffect (Date.toISOString row.albums.createdAt)
    pure (mergeForeign (toForeign row.albums) (toForeign
      { tags: fromMaybe [] (toMaybe row.artists >>= toMaybe <<< _.genres), tracks: details.tracks
      , playCount: details.playCount, uniqueListeners: details.uniqueListeners
      , discogs: toDiscogsView row.discogs_releases details.relations, createdAt }))
  case result of
    Right body -> pure body
    Left e | Xrpc.isInvalidRequestError e -> throwError e
    Left e -> throwError (error ("Failed to retrieve album: " <> errorName e <> ": " <> message e))
  where
  countRows = fromMaybe 0 <<< map _.count <<< head

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.album.getAlbum"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { uri :: String }
      result <- attempt (timeoutMs 120000 (retryTransientDb (getAlbum ctx params.uri (Util.authDid input))))
      case result of
        Right body -> pure (Xrpc.Json body)
        Left e | Xrpc.isInvalidRequestError e -> throwError e
        Left e -> liftEffect (logError e) $> Util.json {}
  }
