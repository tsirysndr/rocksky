module Rocksky.Xrpc.App.Rocksky.Player.AddItemsToQueue (register, addItems) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Axios as Axios
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Xrpc.Util as Util

addItems :: Context -> Maybe String -> Array String -> Aff Unit
addItems ctx did items = case did of
  Nothing -> throwError (error "Authentication required")
  Just "" -> throwError (error "Authentication required")
  Just user ->
    void (Axios.post ctx.tracklist "/tracklist.addTracks" (F.toForeign { did: user, track_ids: items }))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.player.addItemsToQueue"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let items = fromMaybe [] (F.readArrayAt "items" (F.toForeign (Util.params input :: {})))
      recoverWith unit (timeoutMs 10000 (addItems ctx (Util.authDid input) (map F.unsafeFromForeign items)))
      pure Xrpc.NoContent
  }
