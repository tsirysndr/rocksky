module Rocksky.Xrpc.Groups.Library (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Library.CreatePlaylist as CreatePlaylist
import Rocksky.Xrpc.App.Rocksky.Library.DeleteAlbum as DeleteAlbum
import Rocksky.Xrpc.App.Rocksky.Library.DeletePlaylist as DeletePlaylist
import Rocksky.Xrpc.App.Rocksky.Library.DeleteSong as DeleteSong
import Rocksky.Xrpc.App.Rocksky.Library.GetAlbum as GetAlbum
import Rocksky.Xrpc.App.Rocksky.Library.GetAlbumInfo as GetAlbumInfo
import Rocksky.Xrpc.App.Rocksky.Library.GetAlbumList as GetAlbumList
import Rocksky.Xrpc.App.Rocksky.Library.GetArtist as GetArtist
import Rocksky.Xrpc.App.Rocksky.Library.GetArtistInfo as GetArtistInfo
import Rocksky.Xrpc.App.Rocksky.Library.GetArtists as GetArtists
import Rocksky.Xrpc.App.Rocksky.Library.GetCoverArtUrl as GetCoverArtUrl
import Rocksky.Xrpc.App.Rocksky.Library.GetDownloadUrl as GetDownloadUrl
import Rocksky.Xrpc.App.Rocksky.Library.GetGenres as GetGenres
import Rocksky.Xrpc.App.Rocksky.Library.GetIndexes as GetIndexes
import Rocksky.Xrpc.App.Rocksky.Library.GetInternetRadioStations as GetInternetRadioStations
import Rocksky.Xrpc.App.Rocksky.Library.GetLicense as GetLicense
import Rocksky.Xrpc.App.Rocksky.Library.GetLyrics as GetLyrics
import Rocksky.Xrpc.App.Rocksky.Library.GetMusicDirectory as GetMusicDirectory
import Rocksky.Xrpc.App.Rocksky.Library.GetMusicFolders as GetMusicFolders
import Rocksky.Xrpc.App.Rocksky.Library.GetNowPlaying as GetNowPlaying
import Rocksky.Xrpc.App.Rocksky.Library.GetPlayQueue as GetPlayQueue
import Rocksky.Xrpc.App.Rocksky.Library.GetPlaylist as GetPlaylist
import Rocksky.Xrpc.App.Rocksky.Library.GetPlaylists as GetPlaylists
import Rocksky.Xrpc.App.Rocksky.Library.GetRandomSongs as GetRandomSongs
import Rocksky.Xrpc.App.Rocksky.Library.GetScanStatus as GetScanStatus
import Rocksky.Xrpc.App.Rocksky.Library.GetSimilarSongs as GetSimilarSongs
import Rocksky.Xrpc.App.Rocksky.Library.GetSong as GetSong
import Rocksky.Xrpc.App.Rocksky.Library.GetSongsByGenre as GetSongsByGenre
import Rocksky.Xrpc.App.Rocksky.Library.GetStarred as GetStarred
import Rocksky.Xrpc.App.Rocksky.Library.GetStreamUrl as GetStreamUrl
import Rocksky.Xrpc.App.Rocksky.Library.GetTopSongs as GetTopSongs
import Rocksky.Xrpc.App.Rocksky.Library.GetUser as GetUser
import Rocksky.Xrpc.App.Rocksky.Library.Ping as Ping
import Rocksky.Xrpc.App.Rocksky.Library.SavePlayQueue as SavePlayQueue
import Rocksky.Xrpc.App.Rocksky.Library.Scrobble as Scrobble
import Rocksky.Xrpc.App.Rocksky.Library.Search as Search
import Rocksky.Xrpc.App.Rocksky.Library.Star as Star
import Rocksky.Xrpc.App.Rocksky.Library.StartScan as StartScan
import Rocksky.Xrpc.App.Rocksky.Library.Unstar as Unstar
import Rocksky.Xrpc.App.Rocksky.Library.UpdateNowPlaying as UpdateNowPlaying
import Rocksky.Xrpc.App.Rocksky.Library.UpdatePlaylist as UpdatePlaylist

register :: Server -> Context -> Effect Unit
register server ctx = do
  CreatePlaylist.register server ctx
  DeleteAlbum.register server ctx
  DeletePlaylist.register server ctx
  DeleteSong.register server ctx
  GetAlbum.register server ctx
  GetAlbumInfo.register server ctx
  GetAlbumList.register server ctx
  GetArtist.register server ctx
  GetArtistInfo.register server ctx
  GetArtists.register server ctx
  GetCoverArtUrl.register server ctx
  GetDownloadUrl.register server ctx
  GetGenres.register server ctx
  GetIndexes.register server ctx
  GetInternetRadioStations.register server ctx
  GetLicense.register server ctx
  GetLyrics.register server ctx
  GetMusicDirectory.register server ctx
  GetMusicFolders.register server ctx
  GetNowPlaying.register server ctx
  GetPlayQueue.register server ctx
  GetPlaylist.register server ctx
  GetPlaylists.register server ctx
  GetRandomSongs.register server ctx
  GetScanStatus.register server ctx
  GetSimilarSongs.register server ctx
  GetSong.register server ctx
  GetSongsByGenre.register server ctx
  GetStarred.register server ctx
  GetStreamUrl.register server ctx
  GetTopSongs.register server ctx
  GetUser.register server ctx
  Ping.register server ctx
  SavePlayQueue.register server ctx
  Scrobble.register server ctx
  Search.register server ctx
  Star.register server ctx
  StartScan.register server ctx
  Unstar.register server ctx
  UpdateNowPlaying.register server ctx
  UpdatePlaylist.register server ctx
