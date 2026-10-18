module Rocksky.Subscribers.Index (subscribe) where

import Prelude
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Subscribers.Playlist (onPlaylistImport, onPlaylistIndexed)
import Rocksky.Subscribers.Track (onNewTrack)
import Rocksky.Subscribers.User (onNewUser)
import Rocksky.Subscribers.Scrobble (onNewScrobble)
import Rocksky.Subscribers.Status (onSongChanged, onSongStopped)

subscribe :: Context -> Effect Unit
subscribe ctx = do
  void (onPlaylistImport ctx)
  void (onPlaylistIndexed ctx)
  void (onNewTrack ctx)
  void (onNewUser ctx)
  void (onNewScrobble ctx)
  void (onSongChanged ctx)
  void (onSongStopped ctx)
