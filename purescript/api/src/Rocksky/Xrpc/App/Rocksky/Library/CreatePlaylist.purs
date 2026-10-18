module Rocksky.Xrpc.App.Rocksky.Library.CreatePlaylist (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (attempt)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (mergeForeign, path, readStringAt, toForeign)
import Rocksky.Lib.Navidrome (callNavidrome, libraryErrorResponse)
import Rocksky.Library.PlaylistMirror (mirrorCreate, reportMirror)
import Rocksky.Xrpc.Util (authDid, inputBody, missingDid)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.library.createPlaylist"
  { auth: Just ctx.authVerifier
  , handler: \input -> case authDid input of
      Nothing -> pure missingDid
      Just did -> do
        result <- attempt (callNavidrome ctx "createPlaylist" did (fromMaybe (toForeign {}) (inputBody input)))
        case result of
          Left err -> libraryErrorResponse "createPlaylist" err
          Right body -> case path "playlist" body of
            Nothing -> pure (Json body)
            Just playlist -> case readStringAt "id" playlist of
              Just id | id /= "" -> do
                mirrored <- reportMirror "createPlaylist" (mirrorCreate ctx did id)
                pure $ Json $ case mirrored of
                  Left atprotoError -> mergeForeign body (toForeign { atprotoError })
                  Right uri -> mergeForeign body (toForeign { playlist: mergeForeign playlist (toForeign { uri }) })
              _ -> pure (Json body)
  }
