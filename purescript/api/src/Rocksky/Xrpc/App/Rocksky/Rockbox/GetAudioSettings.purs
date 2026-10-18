module Rocksky.Xrpc.App.Rocksky.Rockbox.GetAudioSettings (register, emptyView, settingsView) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.RepoSettings as Repo
import Rocksky.Lib.JsonRecord (pick)
import Rocksky.Xrpc.Util (authDid, paramString)

emptyView :: Aff Foreign
emptyView = do
  createdAt <- Repo.nowIso
  pure (toForeign { createdAt })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.rockbox.getAudioSettings"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let requested = paramString input "did"
      if fromMaybe "" requested == "" && fromMaybe "" (authDid input) == "" then
        pure (FailureNamed 401 "AuthRequired" "Provide a `did` param for public access or include an auth token.")
      else do
        fallback <- emptyView
        Json <$> recoverWith fallback
          ( timeoutMs 10000 do
              did <- Repo.resolveDid ctx requested (authDid input)
              agent <- Repo.publicAgent ctx did
              existing <- Repo.getExisting agent did "app.rocksky.rockbox.audio.settings" "self"
              case existing of
                Just rec | Repo.isRecord "app.rocksky.rockbox.audio.settings" rec.value -> pure (settingsView rec.value)
                _ -> emptyView
          )
  }

settingsView :: Foreign -> Foreign
settingsView = pick [ "crossfade", "equalizer", "replayGain", "tone", "createdAt", "updatedAt" ]
