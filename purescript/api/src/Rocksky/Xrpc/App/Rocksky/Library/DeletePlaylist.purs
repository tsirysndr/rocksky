module Rocksky.Xrpc.App.Rocksky.Library.DeletePlaylist (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (attempt)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (mergeForeign, readStringAt, toForeign)
import Rocksky.Lib.Navidrome (callNavidrome, libraryErrorResponse)
import Rocksky.Library.PlaylistMirror (mirrorDelete, playlistUriOf, reportMirror)
import Rocksky.Xrpc.Util (authDid, inputBody, missingDid)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.library.deletePlaylist"
  { auth: Just ctx.authVerifier
  , handler: \input -> case authDid input of
      Nothing -> pure missingDid
      Just did -> do
        let params = fromMaybe (toForeign {}) (inputBody input)
        result <- attempt do
          uri <- case readStringAt "id" params of
            Just id | id /= "" -> playlistUriOf ctx id
            _ -> pure Nothing
          body <- callNavidrome ctx "deletePlaylist" did params
          pure { uri, body }
        case result of
          Left err -> libraryErrorResponse "deletePlaylist" err
          Right { uri, body } -> case uri of
            Just playlistUri | playlistUri /= "" -> do
              mirrored <- reportMirror "deletePlaylist" (mirrorDelete ctx did playlistUri)
              pure $ Json $ case mirrored of
                Left atprotoError -> mergeForeign body (toForeign { atprotoError })
                Right _ -> body
            _ -> pure (Json body)
  }
