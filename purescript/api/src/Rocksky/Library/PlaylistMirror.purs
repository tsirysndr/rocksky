module Rocksky.Library.PlaylistMirror where

import Prelude
import Atproto.Api as Api
import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (Nullable, notNull, null, toMaybe, toNullable)
import Drizzle.Builder (innerJoin, limit, offset, orderBy, run, runUpdate, selectFieldsFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Error (logErrorWith)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Playlists.Service as Playlists
import Rocksky.Schema as T

agentFor :: Context -> String -> Aff Api.Agent
agentFor ctx did = createAgent ctx did >>= case _ of
  Just agent -> pure agent
  Nothing -> throwError (error "Your session with your PDS has expired, so the playlist could not be published to your repo.")

ensurePlaylistRecord :: Context -> Api.Agent -> String -> String -> Aff { uri :: String, published :: Boolean }
ensurePlaylistRecord ctx agent did playlistId = do
  users :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
  user <- case head users of
    Just row -> pure row
    Nothing -> throwError (error ("No Rocksky user for " <> did))
  rows :: Array { name :: String, description :: Nullable String, uri :: Nullable String } <- run ctx.db
    ( selectFieldsFrom { name: toSQL T.navidromePlaylistsC.name, description: toSQL T.navidromePlaylistsC.description, uri: toSQL T.navidromePlaylistsC.uri } T.navidromePlaylists
        # where_ (SQL.and (SQL.eq (toSQL T.navidromePlaylistsC.id) (SQL.string playlistId)) (SQL.eq (toSQL T.navidromePlaylistsC.userId) (SQL.string user.id)))
        # limit 1
    )
  row <- case head rows of
    Just row -> pure row
    Nothing -> throwError (error ("Playlist " <> playlistId <> " not found"))
  case toMaybe row.uri of
    Just uri | uri /= "" -> pure { uri, published: false }
    _ -> do
      created <- Playlists.createPlaylist ctx agent { name: row.name, description: row.description, pictureUrl: null }
      runUpdate ctx.db (update T.navidromePlaylists { uri: notNull created.uri } # where_ (SQL.eq (toSQL T.navidromePlaylistsC.id) (SQL.string playlistId)))
      pure { uri: created.uri, published: true }

playlistUriOf :: Context -> String -> Aff (Maybe String)
playlistUriOf ctx playlistId = do
  rows :: Array { uri :: Nullable String } <- run ctx.db (selectFieldsFrom { uri: toSQL T.navidromePlaylistsC.uri } T.navidromePlaylists # where_ (SQL.eq (toSQL T.navidromePlaylistsC.id) (SQL.string playlistId)) # limit 1)
  pure (head rows >>= toMaybe <<< _.uri)

songUriOf :: Context -> String -> Aff String
songUriOf ctx songId = do
  rows :: Array { uri :: Nullable String, title :: String } <- run ctx.db (selectFieldsFrom { uri: toSQL T.tracksC.uri, title: toSQL T.tracksC.title } T.tracks # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string songId)) # limit 1)
  case head rows of
    Nothing -> throwError (error ("Song " <> songId <> " not found"))
    Just row -> case toMaybe row.uri of
      Just uri | uri /= "" -> pure uri
      _ -> throwError (error ("“" <> row.title <> "” has no record on your PDS yet, so it could not be added to the playlist there."))

songUriAtIndex :: Context -> String -> Int -> Aff (Maybe String)
songUriAtIndex ctx playlistId position = do
  rows :: Array { uri :: Nullable String } <- run ctx.db
    ( selectFieldsFrom { uri: toSQL T.tracksC.uri } T.navidromePlaylistTracks
        # innerJoin T.tracks (SQL.eq (toSQL T.navidromePlaylistTracksC.trackId) (toSQL T.tracksC.id))
        # where_ (SQL.eq (toSQL T.navidromePlaylistTracksC.playlistId) (SQL.string playlistId))
        # orderBy [ SQL.asc (toSQL T.navidromePlaylistTracksC.createdAt) ]
        # offset position
        # limit 1
    )
  pure (head rows >>= toMaybe <<< _.uri)

mirrorCreate :: Context -> String -> String -> Aff String
mirrorCreate ctx did playlistId = do
  agent <- agentFor ctx did
  _.uri <$> ensurePlaylistRecord ctx agent did playlistId

type UpdateChanges = { name :: Maybe String, comment :: Maybe String, songIdToAdd :: Maybe String, removedSongUri :: Maybe String }

mirrorUpdate :: Context -> String -> String -> UpdateChanges -> Aff String
mirrorUpdate ctx did playlistId changes = do
  agent <- agentFor ctx did
  { uri, published } <- ensurePlaylistRecord ctx agent did playlistId
  when (not published && (isJust changes.name || isJust changes.comment)) $
    void (Playlists.updatePlaylist ctx agent did uri (toForeign { name: toNullable changes.name, description: toNullable changes.comment }))
  case changes.songIdToAdd of
    Just id | id /= "" -> do
      songUri <- songUriOf ctx id
      void (Playlists.addSongsToPlaylist ctx agent did uri [ songUri ])
    _ -> pure unit
  case changes.removedSongUri of
    Just songUri | songUri /= "" -> do
      rows :: Array { uri :: Nullable String } <- run ctx.db
        ( selectFieldsFrom { uri: toSQL T.playlistTracksC.uri } T.playlistTracks
            # innerJoin T.playlists (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))
            # innerJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
            # where_ (SQL.and (SQL.eq (toSQL T.playlistsC.uri) (SQL.string uri)) (SQL.eq (toSQL T.tracksC.uri) (SQL.string songUri)))
        )
      case head (Playlists.ownUris did (map (\r -> { uri: r.uri, songUri: null }) rows)) of
        Nothing -> throwError (error "The song was removed from your library playlist, but its record on your PDS is still being indexed and could not be retracted yet.")
        Just entry -> do
          repo <- liftEffect (Api.assertDid agent)
          Api.deleteRecord agent { repo, collection: Playlists.playlistSongCollection, rkey: Playlists.rkeyOf entry }
    _ -> pure unit
  pure uri

mirrorDelete :: Context -> String -> String -> Aff Unit
mirrorDelete ctx did uri = do
  agent <- agentFor ctx did
  Playlists.removePlaylist ctx agent did uri

reportMirror :: forall a. String -> Aff a -> Aff (Either String a)
reportMirror method action = do
  result <- attempt action
  case result of
    Right value -> pure (Right value)
    Left err -> do
      liftEffect (logErrorWith ("[library." <> method <> "] atproto mirror failed") err)
      pure (Left (message err))
