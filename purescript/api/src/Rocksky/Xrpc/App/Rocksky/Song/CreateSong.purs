module Rocksky.Xrpc.App.Rocksky.Song.CreateSong (register, create) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Consola as Log
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Foreign as F
import Rocksky.Types.Track (parseTrack)
import Rocksky.Xrpc.App.Rocksky.Song.CreateService (saveTrack)
import Rocksky.Xrpc.Util as Util

create :: Context -> Maybe String -> Foreign -> Aff Foreign
create ctx did input = do
  viewer <- case did of
    Just value | value /= "" -> pure value
    _ -> throwError (error "Failed to create agent: Authentication required to create a song")
  agent <- createAgent ctx viewer
  track <- case parseTrack input of
    Left _ -> throwError (error "Invalid song input")
    Right track -> pure track
  -- Source does not reject a missing agent up front: an existing catalog path
  -- can still succeed; attempting a record write will fail inside the pipeline.
  saved <- saveTrack ctx track (fromMaybe (F.unsafeFromForeign F.undefined) agent)
  createdAt <- liftEffect (Date.toISOString saved.track.createdAt)
  updatedAt <- liftEffect (Date.toISOString saved.track.updatedAt)
  pure (F.mergeForeign (F.toForeign saved.track) (F.toForeign { createdAt, updatedAt }))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.song.createSong"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      result <- attempt (timeoutMs 120000 (retryTransientDb (create ctx (Util.authDid input) (fromMaybe F.undefined (Util.inputBody input)))))
      case result of
        Right view -> pure (Xrpc.Json view)
        -- safeParse(...).data is undefined on invalid source input; subsequent
        -- pure code throws an Effect defect, outside its catchAll fallback.
        Left e | message e == "Invalid song input" -> throwError e
        Left e -> liftEffect (Log.error (message e)) $> Util.json {} }
