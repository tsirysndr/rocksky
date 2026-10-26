module Rocksky.Cli.Command.Reads where

import Prelude
import Data.Array (filter, mapWithIndex, null)
import Data.Foldable (for_)
import Data.Maybe (fromMaybe)
import Data.String (Pattern(..), Replacement(..), joinWith, replace)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Cli.Client as Client
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

text :: String -> Foreign -> String
text key value = fromMaybe "" (F.path key value <#> F.stringValue)

rows :: Foreign -> Array Foreign
rows = fromMaybe [] <<< F.asArray

print :: String -> Aff Unit
print = liftEffect <<< Runtime.print

ranked :: String -> String -> Foreign -> Aff Unit
ranked kind did options = do
  token <- liftEffect Runtime.loadToken
  result <- Client.getRanked kind (Client.new token) did options
  for_ (mapWithIndex (\i item -> { rank: i + 1, item }) (rows result)) \{ rank, item } ->
    print $ show rank <> " " <> Runtime.style "accent" (text (if kind == "artists" then "name" else "title") item)
      <> (if kind == "artists" then "" else " " <> text "artist" item)
      <> " "
      <> Runtime.style "link" (text "play_count" item <> " plays")

scrobbles :: String -> Foreign -> Aff Unit
scrobbles did options = do
  result <- Client.scrobbles (Client.new "") did options
  for_ (rows result) \item -> do
    when_ <- liftEffect $ Runtime.relativeTime (if did == "" then text "date" item else text "created_at" item <> "Z")
    print $ (if did == "" then "@" <> text "user" item <> " is listening to " else "")
      <> Runtime.style "accent" (text "title" item)
      <> " "
      <> text "artist" item
      <> " "
      <> Runtime.style "link" when_

stats :: String -> Aff Unit
stats did = do
  token <- liftEffect Runtime.loadToken
  when (token == "" && did == "") $ throwError (error "You are not logged in. Run `rocksky login <handle>` first.")
  result <- Client.stats (Client.new token) did
  for_ [ { label: "Scrobbles", key: "scrobbles" }, { label: "Tracks", key: "tracks" }, { label: "Albums", key: "albums" }, { label: "Artists", key: "artists" }, { label: "Loved Tracks", key: "lovedTracks" } ] \{ label, key } ->
    print $ label <> " " <> Runtime.style "accent" (text key result)

search :: String -> Foreign -> Aff Unit
search query options = do
  result <- Client.search (Client.new "") query (F.toForeign { size: Client.number "limit" 20 options })
  let hits = fromMaybe [] (F.readArrayAt "hits" result)
  if null hits then print ("No results found for " <> Runtime.style "accent" query <> ".")
  else for_ (filter matches hits) \record -> do
    let kind = text "_federation.indexUid" record
    when (kind == "users") $ print $ Runtime.style "accent" (text "handle" record) <> " " <> text "displayName" record <> " https://rocksky.app/profile/" <> text "did" record
    when (kind == "tracks" || kind == "albums") $ print $ Runtime.style "accent" (text "title" record) <> " " <> text "artist" record <> " " <> link (text "uri" record)
  where
  matches record = allFlags [ "albums", "artists", "tracks", "users" ]
    where
    allFlags flags = filter (\flag -> fromMaybe false (F.readBooleanAt flag options) && text "_federation.indexUid" record /= flag) flags == []
  link uri = if uri == "" then "" else "https://rocksky.app/" <> replace (Pattern "app.rocksky.") (Replacement "") (replace (Pattern "at://") (Replacement "") uri)

nowplaying :: String -> Aff Unit
nowplaying did = do
  token <- liftEffect Runtime.loadToken
  when (token == "" && did == "") $ throwError (error "You are not logged in. Run `rocksky login <handle>` first.")
  let client = Client.new token
  spotify <- Client.getSpotifyNowPlaying client did
  if F.isNullish spotify || F.stringify spotify == "{}" then do
    current <- Client.getNowPlaying client did
    if F.isNullish current || F.stringify current == "{}" then print "No track is currently playing."
    else do
      print $ Runtime.style "accent" (text "title" current <> " - " <> text "artist" current)
      print $ text "album" current
  else do
    print $ Runtime.style "accent" (text "item.name" spotify <> " - " <> joinWith ", " (map (text "name") (fromMaybe [] (F.readArrayAt "item.artists" spotify))))
    print $ text "item.album.name" spotify

createApiKey :: String -> Foreign -> Aff Unit
createApiKey name options = do
  token <- liftEffect Runtime.loadToken
  when (token == "") $ throwError (error "You are not logged in. Run `rocksky login <handle>` first.")
  result <- Client.createApiKey (Client.new token) name (text "description" options)
  print "API key created successfully!"
  print $ "Name: " <> Runtime.style "primary" (text "name" result)
  when (text "description" result /= "") $ print $ "Description: " <> Runtime.style "primary" (text "description" result)
  print $ "Key: " <> Runtime.style "primary" (text "api_key" result)
  print $ "Secret: " <> Runtime.style "primary" (text "shared_secret" result)
