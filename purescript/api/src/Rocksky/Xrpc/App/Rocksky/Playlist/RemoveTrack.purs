module Rocksky.Xrpc.App.Rocksky.Playlist.RemoveTrack (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (timeoutMs)
import Rocksky.Playlists.Service as Service
import Rocksky.Xrpc.App.Rocksky.Shout.Util (requireAgent, requireDid, wrapFailure)
import Rocksky.Xrpc.Util (authDid, paramString, paramInt)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.playlist.removeTrack"
  { auth: Just ctx.authVerifier
  , handler: \input -> timeoutMs 30000 $ wrapFailure "Failed to remove track from playlist" $ do
      did <- requireDid (authDid input)
      agent <- requireAgent ctx did
      Service.removeTrackFromPlaylist ctx agent did (fromMaybe "" (paramString input "uri")) (paramString input "songUri") (paramInt input "index")
      pure NoContent
  }
