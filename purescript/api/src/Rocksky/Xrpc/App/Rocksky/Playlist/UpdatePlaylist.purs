module Rocksky.Xrpc.App.Rocksky.Playlist.UpdatePlaylist (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Playlists.Service as Service
import Rocksky.Xrpc.App.Rocksky.Shout.Util (requireAgent, requireDid, wrapFailure)
import Rocksky.Xrpc.Util (authDid, paramString)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.playlist.updatePlaylist"
  { auth: Just ctx.authVerifier
  , handler: \input -> timeoutMs 30000 $ wrapFailure "Failed to update playlist" $ do
      did <- requireDid (authDid input)
      agent <- requireAgent ctx did
      updated <- Service.updatePlaylist ctx agent did (fromMaybe "" (paramString input "uri")) (toForeign { name: toNullable (paramString input "name"), description: toNullable (paramString input "description"), pictureUrl: toNullable (paramString input "pictureUrl") })
      pure (Json (toForeign updated))
  }
