module Rocksky.Scripts.SyncLibraryPlaylist (main, synchronize, synchronizeWith, publishedSongUris, readPublished, Operations) where

import Prelude
import Atproto.Api as Api
import Consola as Log
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldM, foldl)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, null, notNull, toMaybe)
import Data.Set as Set
import Data.String (Pattern(..), stripPrefix)
import Data.Traversable (for_)
import Drizzle.Builder (innerJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Rocksky.Context (Context, createContext)
import Rocksky.Library.PlaylistMirror (ensurePlaylistRecord)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign as F
import Rocksky.Playlists.Service (addSongsToPlaylist, atUriRepo, playlistSongCollection)
import Rocksky.Schema as T
import Rocksky.Schema.NavidromePlaylists (SelectNavidromePlaylist)
import Rocksky.Scripts.Common (exit, runScript, scriptArgs)

type Operations =
  { agent :: Aff Api.Agent
  , ensure :: Api.Agent -> Aff { uri :: String, published :: Boolean }
  , published :: String -> Aff (Set.Set String)
  , add :: Api.Agent -> String -> String -> Aff Unit
  }

readPublished :: Api.Agent -> String -> Aff (Set.Set String)
readPublished agent playlistUri = page null Set.empty
  where
  repo = atUriRepo playlistUri
  page cursor acc = do
    response <- Api.listRecords agent { repo, collection: playlistSongCollection, limit: 100, cursor }
    let next = foldl (\set record -> case F.readStringAt "playlist.uri" record.value, F.readStringAt "song.uri" record.value of
          Just uri, Just song | uri == playlistUri && song /= "" -> Set.insert song set
          _, _ -> set) acc response.records
    case toMaybe response.cursor of
      Just c | c /= "" -> page (notNull c) next
      _ -> pure next

publishedSongUris :: String -> Aff (Set.Set String)
publishedSongUris uri = do
  endpoint <- extractPdsFromDid (atUriRepo uri)
  pds <- case endpoint of
    Just value -> pure value
    Nothing -> throwError (error "No PDS endpoint found")
  agent <- liftEffect (Api.newAtpAgent pds)
  readPublished agent uri

synchronizeWith :: Context -> String -> String -> Boolean -> Operations -> Aff Unit
synchronizeWith ctx did playlistId dryRun ops = do
  unless (isJust (stripPrefix (Pattern "did:") did)) (throwError (error "First argument must be a DID."))
  when (playlistId == "") (throwError (error "Second argument must be a library playlist id."))
  users <- run ctx.db (selectFieldsFrom { id: T.usersC.id, handle: T.usersC.handle } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1) :: Aff (Array { id :: String, handle :: Nullable String })
  user <- case A.head users of
    Just value -> pure value
    Nothing -> throwError (error ("No Rocksky user for " <> did))
  let handle = fromMaybe did (toMaybe user.handle)
  playlists <- run ctx.db (selectFrom T.navidromePlaylists
    # where_ (SQL.and (SQL.eq (toSQL T.navidromePlaylistsC.id) (SQL.string playlistId)) (SQL.eq (toSQL T.navidromePlaylistsC.userId) (SQL.string user.id))) # limit 1) :: Aff (Array SelectNavidromePlaylist)
  playlist <- case A.head playlists of
    Just value -> pure value
    Nothing -> throwError (error ("Playlist " <> playlistId <> " not found for " <> handle))
  tracks <- run ctx.db (selectFieldsFrom { id: T.tracksC.id, title: T.tracksC.title, uri: T.tracksC.uri } T.navidromePlaylistTracks
    # innerJoin T.tracks (SQL.eq (toSQL T.navidromePlaylistTracksC.trackId) (toSQL T.tracksC.id))
    # where_ (SQL.eq (toSQL T.navidromePlaylistTracksC.playlistId) (SQL.string playlistId))
    # orderBy [SQL.asc (toSQL T.navidromePlaylistTracksC.createdAt)]) :: Aff (Array { id :: String, title :: String, uri :: Nullable String })
  let exists = fromMaybe "" (toMaybe playlist.uri) /= ""
  let missing = A.filter (\t -> fromMaybe "" (toMaybe t.uri) == "") tracks
  liftEffect do
    Log.info (playlist.name <> " — " <> show (A.length tracks) <> " track(s), owner " <> handle)
    Log.info (if exists then "Already published at " <> fromMaybe "" (toMaybe playlist.uri) else "Not published yet")
    unless (A.null missing) do
      Log.warn (show (A.length missing) <> " track(s) have no app.rocksky.song record and will be skipped:")
      for_ missing (\t -> Log.warn ("  - " <> t.title))
  if dryRun then liftEffect (Log.info ("[dry run] would " <> (if exists then "reuse" else "create") <> " the playlist record and add up to " <> show (A.length tracks - A.length missing) <> " song(s)"))
  else do
    agent <- ops.agent
    ensured <- ops.ensure agent
    liftEffect (Log.success ((if ensured.published then "Created" else "Reusing") <> " playlist record " <> ensured.uri))
    already <- ops.published ensured.uri
    let toAdd = A.filter (\uri -> uri /= "" && not (Set.member uri already)) (A.mapMaybe (toMaybe <<< _.uri) tracks)
    if A.null toAdd then liftEffect (Log.success "Every track is already in the playlist record.")
    else do
      added <- foldM (\count song -> do
        result <- attempt (ops.add agent ensured.uri song)
        case result of
          Right _ -> pure (count + 1)
          Left e -> liftEffect (Log.errorF ("Failed to add " <> song <> ":") [errorToForeign e]) *> pure count) 0 toAdd
      liftEffect do
        Log.success ("Added " <> show added <> "/" <> show (A.length toAdd) <> " song(s) to " <> playlist.name)
        Log.info "The AppView rows appear once jetstream ingests the commits."

synchronize :: Context -> String -> String -> Boolean -> Aff Unit
synchronize ctx did playlistId dryRun = synchronizeWith ctx did playlistId dryRun
  { agent: createAgent ctx did >>= case _ of
      Just value -> pure value
      Nothing -> throwError (error ("No usable PDS session for " <> did <> " — the user has to sign in to Rocksky again."))
  , ensure: \agent -> ensurePlaylistRecord ctx agent did playlistId
  , published: publishedSongUris
  , add: \agent uri song -> void (addSongsToPlaylist ctx agent did uri [song])
  }

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  result <- attempt (synchronize ctx (fromMaybe "" (A.index args 0)) (fromMaybe "" (A.index args 1)) (A.elem "--dry-run" (A.drop 2 args)))
  case result of
    Left e -> do
      liftEffect (Log.info "Usage: node bin/run.js Rocksky.Scripts.SyncLibraryPlaylist <did> <playlistId> [--dry-run]")
      throwError e
    Right _ -> exit 0
