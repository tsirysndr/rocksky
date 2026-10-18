module Rocksky.Xrpc.App.Rocksky.Equalizer.DeletePreset (register) where

import Prelude
import Atproto.Api as Api
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (timeoutMs)
import Rocksky.Lib.RepoSettings as Repo
import Rocksky.Xrpc.Util (authDid, paramString)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.equalizer.deletePreset"
  { auth: Just ctx.authVerifier
  , handler: \input -> timeoutMs 10000 do
      { agent } <- Repo.requireAgent ctx (authDid input)
      repo <- liftEffect (Api.assertDid agent)
      Api.deleteRecord agent { repo, collection: "app.rocksky.equalizer", rkey: fromMaybe "" (paramString input "rkey") }
      pure NoContent
  }
