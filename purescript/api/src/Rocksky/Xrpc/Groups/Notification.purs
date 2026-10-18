module Rocksky.Xrpc.Groups.Notification (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Notification.GetUnreadCount as GetUnreadCount
import Rocksky.Xrpc.App.Rocksky.Notification.ListNotifications as ListNotifications
import Rocksky.Xrpc.App.Rocksky.Notification.UpdateSeen as UpdateSeen

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetUnreadCount.register server ctx
  ListNotifications.register server ctx
  UpdateSeen.register server ctx
