module Rocksky.Xrpc.App.Rocksky.Event.GetEvent (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (throwError)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.EventView (findEvent, hydrateEvents)
import Rocksky.Lib.Foreign (undefined)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.event.getEvent"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { uri :: String }
      row <- findEvent ctx params.uri
      case row of
        Nothing -> throwError (Xrpc.invalidRequestNamedError "Event not found" "NotFound")
        Just event -> do
          events <- hydrateEvents ctx [event] (Util.authDid input)
          pure (Xrpc.Json (fromMaybe undefined (head events)))
  }
