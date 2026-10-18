module Rocksky.Xrpc.App.Rocksky.Graph.GetFollows (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (toForeign, undefined)
import Rocksky.Xrpc.App.Rocksky.Graph.Common (retrieve)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.graph.getFollows"
  { auth: Nothing
  , handler: \input -> Xrpc.Json <$> recoverWith
      (toForeign { subject: undefined, follows: ([] :: Array Foreign), count: 0 })
      (timeoutMs 120000 (retryTransientDb (retrieve false ctx (Util.params input))))
  }
