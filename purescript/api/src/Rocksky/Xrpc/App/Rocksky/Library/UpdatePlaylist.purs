module Rocksky.Xrpc.App.Rocksky.Library.UpdatePlaylist (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (attempt)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (mergeForeign, readIntAt, readStringAt, toForeign)
import Rocksky.Lib.Navidrome (callNavidrome, libraryErrorResponse)
import Rocksky.Library.PlaylistMirror (mirrorUpdate, reportMirror, songUriAtIndex)
import Rocksky.Xrpc.Util (authDid, inputBody, missingDid)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.library.updatePlaylist"
  { auth: Just ctx.authVerifier
  , handler: \input -> case authDid input of
      Nothing -> pure missingDid
      Just did -> do
        let params = fromMaybe (toForeign {}) (inputBody input)
        let playlistId = readStringAt "playlistId" params
        result <- attempt do
          removedSongUri <- case playlistId, readIntAt "songIndexToRemove" params of
            Just id, Just position | id /= "" -> songUriAtIndex ctx id position
            _, _ -> pure Nothing
          body <- callNavidrome ctx "updatePlaylist" did params
          pure { body, removedSongUri }
        case result of
          Left err -> libraryErrorResponse "updatePlaylist" err
          Right { body, removedSongUri } -> case playlistId of
            Just id | id /= "" -> do
              mirrored <- reportMirror "updatePlaylist"
                ( mirrorUpdate ctx did id
                    { name: readStringAt "name" params
                    , comment: readStringAt "comment" params
                    , songIdToAdd: readStringAt "songIdToAdd" params
                    , removedSongUri
                    }
                )
              pure $ Json $ mergeForeign body $ case mirrored of
                Left atprotoError -> toForeign { atprotoError }
                Right uri -> toForeign { uri }
            _ -> pure (Json body)
  }
