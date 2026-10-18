module Rocksky.Xrpc.App.Rocksky.Notification.UpdateSeen (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Array (mapMaybe)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Foreign (asString, readArrayAt, toForeign)
import Rocksky.Notifications.Service as Service
import Rocksky.Xrpc.Util (authDid, inputBody)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.notification.updateSeen"
  { auth: Just ctx.authVerifier
  , handler: \input -> Json <$> recoverWith (toForeign { unreadCount: 0 })
      ( do
          found <- Service.userIdForDid ctx (authDid input)
          case found of
            Nothing -> pure (toForeign { unreadCount: 0 })
            Just userId -> do
              let ids = mapMaybe asString (fromMaybe [] (inputBody input >>= readArrayAt "ids"))
              unreadCount <- Service.markSeen ctx userId ids
              pure (toForeign { unreadCount })
      )
  }
