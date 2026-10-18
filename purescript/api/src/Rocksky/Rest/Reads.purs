module Rocksky.Rest.Reads (register) where

import Prelude
import Axios as Axios
import Data.Foldable (foldM)
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable)
import Data.String (Pattern(..), contains, split)
import Data.Traversable (for_)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (innerJoin, limit, limitNumber, offsetNumber, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (tableSQL, toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import Hono as Hono
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Credits (creditsArtist)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Lovedtracks.Service as Loved
import Rocksky.Rest.Common as Common
import Rocksky.Schema as T
import Rocksky.Users.Common (queryNumber)

field :: String -> Foreign -> Foreign
field key value = fromMaybe F.undefined (foldM (\v k -> F.asObject v >>= Object.lookup k) value (split (Pattern ".") key))
nonempty :: Maybe String -> Maybe String
nonempty value = value >>= \v -> if v == "" then Nothing else Just v

register :: Context -> Hono.App -> Effect Unit
register ctx app = do
  Hono.get app "/" \c -> Rest.text c 200 "\n    ____             __        __            ___              _    ___\n   / __ \\____  _____/ /_______/ /____  __   /   |  ____  ____| |  / (_)__ _      __\n  / /_/ / __ \\/ ___/ //_/ ___/ //_/ / / /  / /| | / __ \\/ __ \\ | / / / _ \\ | /| / /\n / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /  / ___ |/ /_/ / /_/ / |/ / /  __/ |/ |/ /\n/_/ |_|\\____/\\___/_/|_/____/_/|_|\\__, /  /_/  |_/ .___/ .___/|___/_/\\___/|__/|__/\n                                /____/         /_/   /_/\n\nRocksky AppView\n\nDocs: https://docs.rocksky.app\nSource: https://tangled.org/rocksky.app/rocksky\n"
  Hono.get app "/proxy-image" \c -> case nonempty (Hono.reqQuery c "url") of
    Nothing -> Rest.text c 400 "Missing url"
    Just url -> do
      result <- attempt do
        upstream <- Fetch.fetch url
        if not (Fetch.ok upstream) then Rest.text c 502 "Upstream error"
        else liftEffect do
          response <- Fetch.webResponse (Fetch.bodyStream upstream) 200 (Object.fromFoldable [Tuple "content-type" (fromMaybe "image/jpeg" (Fetch.header upstream "content-type"))])
          pure (Hono.rawResponse response)
      case result of
        Left _ -> Rest.text c 502 "Failed to fetch image"
        Right response -> pure response
  Common.route ctx app "GET" "/now-playing" \c -> do
    payloadDid <- case bearerFrom (Hono.reqHeader c "authorization") of
      Nothing -> pure Nothing
      Just token -> do
        payload <- verifyToken ctx.db token
        pure (F.asString (F.toForeign payload.did))
    let did = case nonempty (Hono.reqQuery c "did") of
          Just value -> Just value
          Nothing -> nonempty payloadDid
    case did of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just value -> do
        users <- run ctx.db (selectFrom T.users # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string value)) (SQL.eq (toSQL T.usersC.handle) (SQL.string value))) # limit 1) :: Aff (Array { did :: String })
        case A.head users of
          Nothing -> Rest.text c 401 "Unauthorized"
          Just user -> do
            values <- sequential $ { track: _, status: _ } <$> parallel (Redis.get ctx.redis ("nowplaying:" <> user.did)) <*> parallel (Redis.get ctx.redis ("nowplaying:" <> user.did <> ":status"))
            case nonempty values.track of
              Nothing -> Rest.json c 200 (F.toForeign {})
              Just encoded -> case F.parseJson encoded of
                Left err -> throwError (error err)
                Right track -> Rest.json c 200 (F.mergeForeign track (F.toForeign { is_playing: fromMaybe (values.status == Just "1") (F.readBooleanAt "is_playing" track) }))
  for_ [{ path: "/now-playings", method: "library.getDistinctScrobbles", size: 10.0 }, { path: "/tracks", method: "library.getTracks", size: 100.0 }, { path: "/albums", method: "library.getAlbums", size: 100.0 }, { path: "/artists", method: "library.getArtists", size: 100.0 }] \config ->
    Common.route ctx app "GET" config.path \c -> do
      response <- Axios.post ctx.analytics config.method (F.toForeign { pagination: { skip: queryNumber c "offset" 0.0, take: queryNumber c "size" config.size } })
      Rest.json c 200 (Axios.data_ response)
  Common.route ctx app "GET" "/likes" \c -> Common.withDid ctx c \did -> Common.withUser ctx c did \user -> do
    tracks <- Loved.getLovedTracksNumber ctx user (queryNumber c "size" 10.0) (queryNumber c "offset" 0.0)
    Rest.json c 200 (F.toForeign tracks)
  Common.route ctx app "GET" "/public/scrobbles" \c -> do
    rows <- run ctx.db (selectFieldsFrom { scrobble: tableSQL T.scrobbles, track: tableSQL T.tracks, user: tableSQL T.users } T.scrobbles
      # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
      # innerJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
      # orderBy [SQL.desc (toSQL T.scrobblesC.timestamp)] # limitNumber (queryNumber c "size" 10.0) # offsetNumber (queryNumber c "offset" 0.0)) :: Aff (Array {})
    Rest.json c 200 (F.toForeign (map (\row -> { cover: field "track.albumArt" row, artist: field "track.artist" row, title: field "track.title" row, date: field "scrobble.timestamp" row, user: field "user.handle" row, uri: field "scrobble.uri" row, albumUri: field "track.albumUri" row, artistUri: field "track.artistUri" row, tags: [] :: Array Foreign, listeners: 1, sha256: field "track.sha256" row, id: field "scrobble.id" row }) (map F.toForeign rows)))
  Common.route ctx app "GET" "/scrobbles" \c -> Common.withDid ctx c \did -> Common.withUser ctx c did \user -> do
    rows <- run ctx.db (selectFieldsFrom { scrobble: tableSQL T.scrobbles, track: tableSQL T.tracks } T.scrobbles
      # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
      # where_ (SQL.and (SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id)) (SQL.isNotNull (toSQL T.scrobblesC.uri)))
      # orderBy [SQL.desc (toSQL T.scrobblesC.createdAt)] # limitNumber (queryNumber c "size" 10.0) # offsetNumber (queryNumber c "offset" 0.0)) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  Common.route ctx app "GET" "/public/scrobbleschart" \c -> do
    let post method payload = Axios.post ctx.analytics method payload >>= Rest.json c 200 <<< Axios.data_
    case nonempty (Hono.reqQuery c "did"), nonempty (Hono.reqQuery c "artisturi"), nonempty (Hono.reqQuery c "albumuri"), nonempty (Hono.reqQuery c "songuri") of
      Just did, _, _, _ -> post "library.getScrobblesPerDay" (F.toForeign { user_did: did })
      _, Just uri, _, _ -> post "library.getArtistScrobbles" (F.toForeign { artist_id: uri })
      _, _, Just uri, _ -> post "library.getAlbumScrobbles" (F.toForeign { album_id: uri })
      _, _, _, Just songuri -> do
        uri <- if contains (Pattern "app.rocksky.scrobble") songuri then do
          rows <- run ctx.db (selectFieldsFrom { scrobble: tableSQL T.scrobbles, track: tableSQL T.tracks } T.scrobbles
            # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
            # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string songuri)) # limit 1) :: Aff (Array { track :: { uri :: Foreign } })
          row <- Rest.firstRow rows
          pure row.track.uri
        else pure (F.toForeign songuri)
        post "library.getTrackScrobbles" (F.toForeign { track_id: uri })
      _, _, _, _ -> post "library.getScrobblesPerDay" (F.toForeign {})
  Common.route ctx app "GET" "/tracks/:sha256" \c -> do
    rows <- run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string (Hono.reqParam c "sha256"))) # limit 1) :: Aff (Array {})
    Rest.json c 200 (fromMaybe F.undefined (F.toForeign <$> A.head rows))
  Common.route ctx app "GET" "/albums/:sha256" \c -> do
    rows <- run ctx.db (selectFrom T.albums # where_ (SQL.eq (toSQL T.albumsC.sha256) (SQL.string (Hono.reqParam c "sha256"))) # limit 1) :: Aff (Array {})
    Rest.json c 200 (fromMaybe F.undefined (F.toForeign <$> A.head rows))
  Common.route ctx app "GET" "/artists/:sha256" \c -> do
    rows <- run ctx.db (selectFrom T.artists # where_ (SQL.eq (toSQL T.artistsC.sha256) (SQL.string (Hono.reqParam c "sha256"))) # limit 1) :: Aff (Array {})
    Rest.json c 200 (fromMaybe F.undefined (F.toForeign <$> A.head rows))
  Common.route ctx app "GET" "/artists/:sha256/tracks" \c -> do
    rows <- run ctx.db (selectFieldsFrom { track: tableSQL T.tracks, artistName: toSQL T.artistsC.name } T.artistTracks
      # innerJoin T.tracks (SQL.eq (toSQL T.artistTracksC.trackId) (toSQL T.tracksC.id))
      # innerJoin T.artists (SQL.eq (toSQL T.artistTracksC.artistId) (toSQL T.artistsC.id))
      # where_ (SQL.eq (toSQL T.artistsC.sha256) (SQL.string (Hono.reqParam c "sha256")))) :: Aff (Array { track :: Foreign, artistName :: Nullable String })
    Rest.json c 200 (F.toForeign (map _.track (A.filter (\r -> creditsArtist r.artistName (F.unsafeFromForeign r.track)) rows)))
  Common.route ctx app "GET" "/albums/:sha256/tracks" \c -> do
    rows <- run ctx.db (selectFieldsFrom { track: tableSQL T.tracks } T.albumTracks
      # innerJoin T.tracks (SQL.eq (toSQL T.albumTracksC.trackId) (toSQL T.tracksC.id))
      # innerJoin T.albums (SQL.eq (toSQL T.albumTracksC.albumId) (toSQL T.albumsC.id))
      # where_ (SQL.eq (toSQL T.albumsC.sha256) (SQL.string (Hono.reqParam c "sha256")))) :: Aff (Array { track :: Foreign })
    Rest.json c 200 (F.toForeign (map _.track rows))
