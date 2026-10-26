module Rocksky.Cli.Tui.Library where

import Prelude
import Data.Either (Either(..))
import Data.Foldable (foldM)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Effect.Aff (Aff, throwError, try)
import Effect.Exception (error)
import Fetch as Fetch
import Foreign (Foreign)
import Rocksky.Cli.Client as Client
import Rocksky.Lib.Foreign as F

type Credentials = { handle :: String, apiKey :: String }

navidromeUrl :: String
navidromeUrl = "https://navidrome.rocksky.app"

restUrl :: String -> Credentials -> Foreign -> String
restUrl method credentials params = navidromeUrl <> "/rest/" <> method <> "?" <> Client.query
  ( F.mergeForeign
      (F.toForeign { u: credentials.handle, p: credentials.apiKey, c: "rocksky", v: "1.16.1", f: "json" })
      params
  )

call :: String -> Credentials -> Foreign -> Aff Foreign
call method credentials params = do
  response <- Fetch.fetch (restUrl method credentials params) >>= Fetch.json
  let result = fromMaybe F.undefined (F.path "subsonic-response" response)
  if Client.field "status" result == "ok" then pure result
  else throwError $ error (fromMaybe (method <> " failed") (F.readStringAt "error.message" result))

libraryProcedure :: String -> String -> Foreign -> Aff Foreign
libraryProcedure token method body = do
  response <- Fetch.fetchWith (Client.apiUrl <> "/xrpc/app.rocksky.library." <> method)
    ( Fetch.defaultOptions
        { method = "POST", headers = Client.headers (Client.new token), body = toNullable (Just (F.toForeign (F.stringify body))) }
    )
  json <- try (Fetch.json response)
  let
    result = case json of
      Right value -> value
      Left _ -> F.toForeign {}
  unless (Fetch.ok response) $ throwError $ error (fromMaybe ("library." <> method <> " failed (" <> show (Fetch.status response) <> ")") (F.readStringAt "message" result))
  case F.readStringAt "atprotoError" result of
    Just message | message /= "" -> throwError (error message)
    _ -> pure result

asArray :: Foreign -> Array Foreign
asArray value = fromMaybe (if F.isNullish value then [] else [ value ]) (F.asArray value)

list :: String -> String -> Credentials -> Aff (Array Foreign)
list method path credentials = do
  response <- call method credentials (F.toForeign {})
  pure $ asArray $ fromMaybe F.undefined (F.path path response)

getPlaylists :: Credentials -> Aff (Array Foreign)
getPlaylists = list "getPlaylists" "playlists.playlist"

getStarred :: Credentials -> Aff (Array Foreign)
getStarred = list "getStarred2" "starred2.song"

star :: Credentials -> String -> Aff Foreign
star credentials id = call "star" credentials (F.toForeign { id })

unstar :: Credentials -> String -> Aff Foreign
unstar credentials id = call "unstar" credentials (F.toForeign { id })

getPlaylist :: Credentials -> String -> Aff { playlist :: Foreign, entries :: Array Foreign }
getPlaylist credentials id = do
  response <- call "getPlaylist" credentials (F.toForeign { id })
  pure { playlist: fromMaybe F.undefined (F.path "playlist" response), entries: asArray $ fromMaybe F.undefined (F.path "playlist.entry" response) }

getAlbum :: Credentials -> String -> Aff { album :: Foreign, entries :: Array Foreign }
getAlbum credentials id = do
  response <- call "getAlbum" credentials (F.toForeign { id })
  pure { album: fromMaybe F.undefined (F.path "album" response), entries: asArray $ fromMaybe F.undefined (F.path "album.song" response) }

createPlaylist :: String -> String -> Aff String
createPlaylist token name = Client.field "playlist.id" <$> libraryProcedure token "createPlaylist" (F.toForeign { name })

deletePlaylist :: String -> String -> Aff Foreign
deletePlaylist token id = libraryProcedure token "deletePlaylist" (F.toForeign { id })

addTrackToPlaylist :: String -> String -> String -> Aff Foreign
addTrackToPlaylist token playlistId songIdToAdd = libraryProcedure token "updatePlaylist" (F.toForeign { playlistId, songIdToAdd })

removeTrackFromPlaylist :: String -> String -> Int -> Aff Foreign
removeTrackFromPlaylist token playlistId songIndexToRemove = libraryProcedure token "updatePlaylist" (F.toForeign { playlistId, songIndexToRemove })

streamUrl :: Credentials -> String -> String
streamUrl credentials id = restUrl "stream" credentials (F.toForeign { id })

exportQueue :: String -> String -> Array String -> Aff { id :: String, added :: Int, failed :: Int }
exportQueue token name songs = do
  id <- createPlaylist token name
  when (id == "") $ throwError (error "Failed to create playlist")
  foldM
    ( \state song -> do
        result <- try (addTrackToPlaylist token id song)
        pure $ case result of
          Left _ -> state { failed = state.failed + 1 }
          Right _ -> state { added = state.added + 1 }
    )
    { id, added: 0, failed: 0 }
    songs

entryToItem :: Foreign -> Foreign
entryToItem entry = F.omitNulls $ F.toForeign
  { uploadId: ""
  , trackId: Client.field "id" entry
  , title: Client.field "title" entry
  , artist: Client.field "artist" entry
  , album: toNullable (F.readStringAt "album" entry)
  , duration: toNullable do
      seconds <- F.readNumberAt "duration" entry
      if seconds == 0.0 then Nothing else Just (seconds * 1000.0)
  }
