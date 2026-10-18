module Rocksky.Xrpc.App.Rocksky.Rockbox.PutAudioSettings (register, mergeSettings) where

import Prelude
import Atproto.Api as Api
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign (toForeign, path, mergeForeign, readStringAt)
import Rocksky.Lib.RepoSettings as Repo
import Rocksky.Lib.JsonRecord (field)
import Rocksky.Xrpc.App.Rocksky.Rockbox.GetAudioSettings (emptyView, settingsView)
import Rocksky.Xrpc.Util (authDid, inputBody)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.rockbox.putAudioSettings"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      fallback <- emptyView
      Json <$> recoverWith fallback
        ( timeoutMs 10000 do
            { agent, did } <- Repo.requireAgent ctx (authDid input)
            existing <- Repo.getExisting agent did collection "self"
            now <- Repo.nowIso
            let record = mergeSettings (fromMaybe (toForeign {}) (inputBody input)) (Repo.recordValue collection existing) now
            repo <- liftEffect (Api.assertDid agent)
            _ <- Api.putRecord agent { repo, collection, rkey: "self", record, swapRecord: Repo.swapRecord existing, validate: false }
            pure (settingsView record)
        )
  }
  where
  collection = "app.rocksky.rockbox.audio.settings"

mergeSettings :: Foreign -> Foreign -> String -> Foreign
mergeSettings input existing now = toForeign
  { "$type": "app.rocksky.rockbox.audio.settings"
  , crossfade: section "crossfade"
  , equalizer: section "equalizer"
  , replayGain: section "replayGain"
  , tone: section "tone"
  , createdAt: fromMaybe now (readStringAt "createdAt" existing)
  , updatedAt: now
  }
  where
  section key = case path key input of
    Just patch -> mergeForeign (field key existing) patch
    Nothing -> field key existing
