module Rocksky.Xrpc.App.Rocksky.Song.CreateRecords (putArtist, putAlbum, putSong, recordKey) where

import Prelude
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Consola as Log
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable as N
import Data.Traversable (traverse)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Common (withFallbackAlbumArt)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Shouts.Service (validate)
import Rocksky.Types.Track (Track)

-- The source evaluates TID.nextStr once when constructing its Effect value.
recordKey :: String
recordKey = unsafePerformEffect tidNextStr

put :: Context -> Api.Agent -> String -> Foreign -> Aff String
put ctx agent collection record = do
  validate ctx collection record "Invalid record"
  repo <- liftEffect (Api.assertDid agent)
  result <- Api.putRecord agent { repo, collection, rkey: recordKey, record, validate: false, swapRecord: Nothing }
  liftEffect (Log.info ("Record created at " <> result.uri))
  pure result.uri

optional :: forall a. N.Nullable a -> Foreign
optional = fromMaybe F.undefined <<< map F.toForeign <<< N.toMaybe

putArtist :: Context -> Track -> Api.Agent -> Aff String
putArtist ctx track agent = do
  createdAt <- nowIso
  put ctx agent "app.rocksky.artist" (F.toForeign { "$type": "app.rocksky.artist", name: track.albumArtist, createdAt, pictureUrl: track.artistPicture })

putAlbum :: Context -> Track -> Api.Agent -> Aff String
putAlbum ctx track agent = do
  createdAt <- nowIso
  date <- liftEffect (traverse Date.toISOString (N.toMaybe track.releaseDate))
  put ctx agent "app.rocksky.album" (F.toForeign
    { "$type": "app.rocksky.album", title: track.album, artist: track.albumArtist, year: track.year
    , releaseDate: fromMaybe F.undefined (F.toForeign <$> date), createdAt, albumArtUrl: withFallbackAlbumArt track.albumArt })

putSong :: Context -> Track -> Api.Agent -> Aff String
putSong ctx track agent = do
  createdAt <- nowIso
  date <- liftEffect (traverse Date.toISOString (N.toMaybe track.releaseDate))
  put ctx agent "app.rocksky.song" (F.toForeign
    { "$type": "app.rocksky.song", title: track.title, artist: track.artist, album: track.album, albumArtist: track.albumArtist, duration: track.duration
    , releaseDate: fromMaybe F.undefined (F.toForeign <$> date), year: track.year, albumArtUrl: withFallbackAlbumArt track.albumArt
    , composer: optional track.composer, lyrics: optional track.lyrics, trackNumber: track.trackNumber
    , discNumber: if N.toMaybe track.discNumber == Just 0.0 then N.notNull 1.0 else track.discNumber
    , copyrightMessage: optional track.copyrightMessage, createdAt, spotifyLink: optional track.spotifyLink, mbid: optional track.mbId, isrc: optional track.isrc })
