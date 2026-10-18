module Rocksky.Xrpc.App.Rocksky.Feed.Search (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Typesense.Search (federatedSearch)
import Rocksky.Xrpc.Util (paramString, paramInt)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.feed.search"
  { auth: Nothing
  , handler: \input -> do
      let
        size = case paramInt input "size" of
          Just n | n > 0 -> min n 100
          _ -> 20
      result <- federatedSearch ctx (fromMaybe "" (paramString input "query")) size
      pure (Json (toForeign result))
  }
