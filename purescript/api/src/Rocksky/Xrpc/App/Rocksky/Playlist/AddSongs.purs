module Rocksky.Xrpc.App.Rocksky.Playlist.AddSongs (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Playlists.Service as Service
import Rocksky.Xrpc.App.Rocksky.Shout.Util (requireAgent, requireDid)
import Rocksky.Xrpc.Util (authDid, paramString, paramStringArray)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.playlist.addSongs"
  { auth: Just ctx.authVerifier
  , handler: \input -> timeoutMs 60000 $ do
      did <- requireDid (authDid input)
      agent <- requireAgent ctx did
      uris <- Service.addSongsToPlaylist ctx agent did (fromMaybe "" (paramString input "uri")) (paramStringArray input "songs")
      pure (Json (toForeign { uris }))
  }
