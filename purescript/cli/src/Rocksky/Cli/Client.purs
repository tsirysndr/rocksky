module Rocksky.Cli.Client where

import Prelude
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Data.Tuple (Tuple(..))
import Effect.Aff (Aff, try, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

type Client = { token :: String }

apiUrl :: String
apiUrl = "https://api.rocksky.app"

new :: String -> Client
new token = { token }

get :: Client -> String -> String -> Aff Foreign
get client path description = request client "GET" path Nothing description

request :: Client -> String -> String -> Maybe Foreign -> String -> Aff Foreign
request client method path body description = do
  response <- Fetch.fetchWith (apiUrl <> path)
    ( Fetch.defaultOptions
        { method = method
        , headers = headers client
        , body = toNullable (F.toForeign <<< F.stringify <$> body)
        }
    )
  decodeResponse description response

headers :: Client -> Object.Object String
headers client = Object.fromFoldable $
  [ Tuple "Content-Type" "application/json" ] <>
    if client.token == "" then [] else [ Tuple "Authorization" ("Bearer " <> client.token) ]

decodeResponse :: String -> Fetch.Response -> Aff Foreign
decodeResponse description response =
  if Fetch.ok response then Fetch.json response
  else throwError $ error (description <> ": " <> Runtime.statusText (F.toForeign response))

query :: Foreign -> String
query params = Fetch.urlEncoded $ map F.stringValue $ fromMaybe Object.empty (F.asObject (F.omitNulls params))

field :: String -> Foreign -> String
field key = fromMaybe "" <<< F.readStringAt key

number :: String -> Int -> Foreign -> String
number key fallback options = case F.path key options of
  Just value -> F.stringValue value
  Nothing -> show fallback

page :: Int -> Foreign -> String
page limit options = "offset=" <> number "skip" 0 options <> "&size=" <> number "limit" limit options

getCurrentUser :: Client -> Aff Foreign
getCurrentUser client = get client "/profile" "Failed to fetch user data"

resolveDid :: Client -> String -> Aff String
resolveDid client did
  | did /= "" = pure did
  | otherwise = do
      cached <- try (Runtime.readState "did")
      case cached of
        Right value | value /= "" -> pure value
        _ -> do
          user <- getCurrentUser client
          let value = field "did" user
          when (value == "") $ throwError (error "The profile response contains no DID")
          Runtime.writeState "did" value
          pure value

getNowPlaying :: Client -> String -> Aff Foreign
getNowPlaying client did = get client ("/now-playing" <> didQuery did) "Failed to fetch now playing data"

getSpotifyNowPlaying :: Client -> String -> Aff Foreign
getSpotifyNowPlaying client did = get client ("/spotify/currently-playing" <> didQuery did) "Failed to fetch now playing data"

didQuery :: String -> String
didQuery did = if did == "" then "" else "?" <> query (F.toForeign { did })

scrobbles :: Client -> String -> Foreign -> Aff Foreign
scrobbles client did options = get client
  ((if did == "" then "/public/scrobbles" else "/users/" <> did <> "/scrobbles") <> "?" <> page 20 options)
  "Failed to fetch scrobbles data"

search :: Client -> String -> Foreign -> Aff Foreign
search client text options = get client
  ("/xrpc/app.rocksky.feed.search?" <> query (F.toForeign { query: text, size: number "size" 20 options }))
  "Failed to fetch search data"

stats :: Client -> String -> Aff Foreign
stats client actor = do
  did <- resolveDid client actor
  get (new "") ("/users/" <> did <> "/stats") "Failed to fetch stats data"

getRanked :: String -> Client -> String -> Foreign -> Aff Foreign
getRanked kind client actor options = do
  did <- resolveDid client actor
  get client ("/users/" <> did <> "/" <> kind <> "?" <> page 20 options) ("Failed to fetch " <> kind <> " data")

getArtists :: Client -> String -> Foreign -> Aff Foreign
getArtists = getRanked "artists"

getAlbums :: Client -> String -> Foreign -> Aff Foreign
getAlbums = getRanked "albums"

getTracks :: Client -> String -> Foreign -> Aff Foreign
getTracks = getRanked "tracks"

getApiKeys :: Client -> Aff Foreign
getApiKeys client = get client "/apikeys" "Failed to fetch API keys"

createApiKey :: Client -> String -> String -> Aff Foreign
createApiKey client name description = request client "POST" "/apikeys"
  (Just $ F.toForeign $ Object.fromFoldable $ [ Tuple "name" name ] <> if description == "" then [] else [ Tuple "description" description ])
  "Failed to create API key"

getUploads :: Client -> Foreign -> Aff Foreign
getUploads client options = get client
  ( "/uploads?" <> query
      ( F.mergeForeign
          (F.toForeign { offset: number "skip" 0 options, size: number "limit" 50 options })
          (F.deleteKeys [ "skip", "limit" ] options)
      )
  )
  "Failed to fetch uploads"

emptyOnInvalidJson :: Client -> String -> String -> Maybe Foreign -> String -> Aff Foreign
emptyOnInvalidJson client method path body description = do
  response <- Fetch.fetchWith (apiUrl <> path)
    ( Fetch.defaultOptions
        { method = method, headers = headers client, body = toNullable (F.toForeign <<< F.stringify <$> body) }
    )
  unless (Fetch.ok response) $ throwError $ error (description <> ": " <> Runtime.statusText (F.toForeign response))
  result <- try (Fetch.json response)
  pure $ case result of
    Left _ -> F.toForeign {}
    Right value -> value

deleteUploadByTrack :: Client -> String -> Aff Foreign
deleteUploadByTrack client track = emptyOnInvalidJson client "DELETE" ("/uploads/by-track/" <> track) Nothing "Failed to delete track"

deleteUploadAlbum :: Client -> Foreign -> Aff Foreign
deleteUploadAlbum client params = emptyOnInvalidJson client "DELETE" ("/uploads/album?" <> query params) Nothing "Failed to delete album"

getUploadAlbums :: Client -> Foreign -> Aff Foreign
getUploadAlbums client options = get client ("/uploads/albums?" <> page 200 options) "Failed to fetch upload albums"

getUploadArtists :: Client -> Foreign -> Aff Foreign
getUploadArtists client options = get client ("/uploads/artists?" <> page 200 options) "Failed to fetch upload artists"

getStreamToken :: Client -> Aff Foreign
getStreamToken client = do
  signal <- liftEffect $ Fetch.timeoutSignal 10000
  response <- Fetch.fetchWith (apiUrl <> "/uploads/stream-token") (Fetch.defaultOptions { headers = headers client, signal = toNullable (Just signal) })
  decodeResponse "Failed to get stream token" response

streamUrl :: String -> String -> String
streamUrl uploadId token = apiUrl <> "/uploads/" <> uploadId <> "/stream?" <> query (F.toForeign { token })

scrobbleNowPlaying :: Client -> Foreign -> Aff Foreign
scrobbleNowPlaying client track = request client "POST" "/now-playing" (Just track) "Failed to scrobble"

xrpc :: Client -> String -> Foreign -> Aff Foreign
xrpc client method params = get client ("/xrpc/" <> method <> "?" <> query params) (method <> " failed")

xrpcPost :: Client -> String -> Foreign -> Aff Foreign
xrpcPost client method body = emptyOnInvalidJson client "POST" ("/xrpc/" <> method) (Just body) (method <> " failed")

getStats :: Client -> String -> Aff Foreign
getStats client did = xrpc client "app.rocksky.stats.getStats" (F.toForeign { did })

likeSong :: Client -> String -> Aff Foreign
likeSong client uri = xrpcPost client "app.rocksky.like.likeSong" (F.toForeign { uri })

dislikeSong :: Client -> String -> Aff Foreign
dislikeSong client uri = xrpcPost client "app.rocksky.like.dislikeSong" (F.toForeign { uri })

getList :: Client -> String -> String -> Int -> String -> Foreign -> Aff Foreign
getList client method resultField limit did options = do
  result <- xrpc client method $ F.mergeForeign
    ( F.toForeign $ Object.fromFoldable $
        [ Tuple "offset" (number "skip" 0 options), Tuple "limit" (number "limit" limit options) ] <>
          if did == "" then [] else [ Tuple "did" did ]
    )
    (F.deleteKeys [ "skip", "limit" ] options)
  pure $ F.toForeign $ fromMaybe [] (F.readArrayAt resultField result)

getGlobalScrobbles :: Client -> Foreign -> Aff Foreign
getGlobalScrobbles client = getList client "app.rocksky.scrobble.getScrobbles" "scrobbles" 20 ""

getActorScrobbles :: Client -> String -> Foreign -> Aff Foreign
getActorScrobbles client = getList client "app.rocksky.actor.getActorScrobbles" "scrobbles" 20

getActorSongs :: Client -> String -> Foreign -> Aff Foreign
getActorSongs client = getList client "app.rocksky.actor.getActorSongs" "tracks" 20

getActorArtists :: Client -> String -> Foreign -> Aff Foreign
getActorArtists client = getList client "app.rocksky.actor.getActorArtists" "artists" 20

getActorAlbums :: Client -> String -> Foreign -> Aff Foreign
getActorAlbums client = getList client "app.rocksky.actor.getActorAlbums" "albums" 20

getLovedSongs :: Client -> String -> Foreign -> Aff Foreign
getLovedSongs client = getList client "app.rocksky.actor.getActorLovedSongs" "tracks" 500

matchSong :: Client -> String -> String -> String -> Aff Foreign
matchSong client title artist album = xrpc client "app.rocksky.song.matchSong" $ F.toForeign $ Object.fromFoldable $
  [ Tuple "title" title, Tuple "artist" artist ] <> if album == "" then [] else [ Tuple "album" album ]

legacyScrobble :: Client -> String -> String -> String -> String -> Number -> Aff Foreign
legacyScrobble _ apiKey apiSig title artist time = do
  token <- liftEffect Runtime.loadToken
  if token == "" then do
    liftEffect $ Runtime.printError "You are not logged in. Please run the login command first."
    pure F.undefined
  else do
    current <- liftEffect Runtime.nowSeconds
    response <- Fetch.fetchWith "https://audioscrobbler.rocksky.app/2.0"
      ( Fetch.defaultOptions
          { method = "POST"
          , headers = Object.singleton "Content-Type" "application/x-www-form-urlencoded"
          , body = toNullable $ Just $ F.toForeign $ query $ F.toForeign
              { method: "track.scrobble"
              , "track[0]": title
              , "artist[0]": artist
              , "timestamp[0]": if time == 0.0 then current else time
              , api_key: apiKey
              , api_sig: apiSig
              , sk: token
              , format: "json"
              }
          }
      )
    if Fetch.ok response then Fetch.json response
    else do
      body <- Fetch.text response
      throwError (error ("Failed to scrobble track: " <> Runtime.statusText (F.toForeign response) <> " " <> body))
