-- | app.rocksky.library.deleteSong
module Rocksky.Xrpc.App.Rocksky.Library.DeleteSong (register) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (attempt, message)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Error (logErrorWith)
import Rocksky.Lib.Foreign (readStringAt, toForeign)
import Rocksky.Uploads.DeleteService (deleteUploadsForTrack, isUnknownUserError)
import Rocksky.Xrpc.Util (authDid, inputBody)

-- The authenticated user is taken from the JWT (auth.credentials.did) — never
-- from a request param. The only input is the song id (track xata_id).
register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.deleteSong"
    { auth: Just ctx.authVerifier
    , handler: \input -> case authDid input of
        Nothing -> pure (Failure 400 "Missing authenticated DID.")
        Just did -> case inputBody input >>= readStringAt "id" of
          Just id | id /= "" -> do
            r <- attempt (deleteUploadsForTrack ctx did id)
            case r of
              Right 0 -> pure (Failure 404 "No uploaded song found for the user.")
              Right deleted -> pure (Json (toForeign { status: "ok", deleted }))
              Left err
                | isUnknownUserError err -> pure (Failure 401 (message err))
                | otherwise -> do
                    liftEffect (logErrorWith "[library.deleteSong]" err)
                    pure (Failure 500 "Internal error while deleting song.")
          _ -> pure (Failure 400 "Missing song id.")
    }
