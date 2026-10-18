module Rocksky.Xrpc.Groups.Event (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Event.GetEvent as GetEvent
import Rocksky.Xrpc.App.Rocksky.Event.GetEventRsvps as GetEventRsvps
import Rocksky.Xrpc.App.Rocksky.Event.GetEvents as GetEvents
import Rocksky.Xrpc.App.Rocksky.Event.PutRsvp as PutRsvp

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetEvent.register server ctx
  GetEventRsvps.register server ctx
  GetEvents.register server ctx
  PutRsvp.register server ctx
