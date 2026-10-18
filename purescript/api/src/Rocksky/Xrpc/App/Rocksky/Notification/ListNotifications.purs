module Rocksky.Xrpc.App.Rocksky.Notification.ListNotifications (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Notifications.Service as Service
import Rocksky.Xrpc.Util (authDid, paramInt, paramString)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.notification.listNotifications"
  { auth: Just ctx.authVerifier
  , handler: \input -> Json <$> recoverWith (toForeign { notifications: [] :: Array Foreign, unreadCount: 0 })
      ( do
          found <- Service.userIdForDid ctx (authDid input)
          case found of
            Nothing -> pure (toForeign { notifications: [] :: Array Foreign, unreadCount: 0 })
            Just userId -> do
              page <- Service.listNotifications ctx userId { limit: paramInt input "limit", cursor: paramString input "cursor" }
              unreadCount <- Service.getUnreadCount ctx userId
              pure (mergeForeign page (toForeign { unreadCount }))
      )
  }
