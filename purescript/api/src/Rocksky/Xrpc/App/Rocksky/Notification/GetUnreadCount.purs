module Rocksky.Xrpc.App.Rocksky.Notification.GetUnreadCount (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Notifications.Service as Service
import Rocksky.Xrpc.Util (authDid)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.notification.getUnreadCount"
  { auth: Just ctx.authVerifier
  , handler: \input -> Json <$> recoverWith (toForeign { count: 0 })
      ( do
          found <- Service.userIdForDid ctx (authDid input)
          case found of
            Nothing -> pure (toForeign { count: 0 })
            Just userId -> do
              count <- Service.getUnreadCount ctx userId
              pure (toForeign { count })
      )
  }
