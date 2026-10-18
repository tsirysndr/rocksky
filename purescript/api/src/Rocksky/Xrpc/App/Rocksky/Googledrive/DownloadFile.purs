module Rocksky.Xrpc.App.Rocksky.Googledrive.DownloadFile (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Effect.Aff (throwError)
import Effect.Exception (error)

-- The TypeScript source has no implemented operation here. Preserve its response.
register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.googledrive.downloadFile"
  { auth: Just ctx.authVerifier, handler: \_ -> throwError (error "Not implemented yet") }
