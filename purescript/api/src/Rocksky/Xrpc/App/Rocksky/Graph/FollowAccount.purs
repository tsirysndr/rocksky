module Rocksky.Xrpc.App.Rocksky.Graph.FollowAccount (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Xrpc.App.Rocksky.Graph.Mutations (mutate)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.graph.followAccount"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: { account :: String }
      Xrpc.Json <$> recoverWith (toForeign { subject: {}, followers: ([] :: Array Foreign) })
        (timeoutMs 120000 (retryTransientDb (mutate true ctx params.account (Util.authDid input))))
  }
