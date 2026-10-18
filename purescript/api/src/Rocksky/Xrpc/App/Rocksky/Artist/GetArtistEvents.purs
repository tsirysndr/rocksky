module Rocksky.Xrpc.App.Rocksky.Artist.GetArtistEvents (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, notNull, null)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.EventView (listEvents)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.artist.getArtistEvents"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { uri :: String, includePast :: Nullable Boolean, limit :: Int, offset :: Int }
      events <- listEvents ctx
        { artist: notNull params.uri, includePast: params.includePast, limit: params.limit, offset: params.offset
        , did: null, rsvpBy: null, kind: null, genre: null, from: null, to: null } (Util.authDid input)
      pure (Util.json { events })
  }
