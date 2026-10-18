module Rocksky.Xrpc.App.Rocksky.Event.GetEvents (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.EventView (EventFilters, listEvents)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.event.getEvents"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      events <- listEvents ctx (Util.params input :: EventFilters) (Util.authDid input)
      pure (Util.json { events })
  }
