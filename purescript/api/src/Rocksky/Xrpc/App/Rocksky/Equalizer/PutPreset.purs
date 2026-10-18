module Rocksky.Xrpc.App.Rocksky.Equalizer.PutPreset (register, makeRecord) where

import Prelude
import Atproto.Api as Api
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (trim)
import Effect (Effect)
import Effect.Aff (throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (timeoutMs)
import Rocksky.Lib.Foreign (mergeForeign, readStringAt, toForeign)
import Rocksky.Lib.RepoSettings as Repo
import Rocksky.Lib.JsonRecord (field, nonNullField)
import Rocksky.Xrpc.App.Rocksky.Equalizer.ListPresets as List
import Rocksky.Xrpc.App.Rocksky.Equalizer.Slug (presetRkey)
import Rocksky.Xrpc.Util (authDid, inputBody)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.equalizer.putPreset"
  { auth: Just ctx.authVerifier
  , handler: \input -> timeoutMs 10000 do
      let body = fromMaybe (toForeign {}) (inputBody input)
      let name = fromMaybe "" (readStringAt "name" body)
      let rkey = presetRkey name
      when (rkey == "") $ throwError (Xrpc.invalidRequestError ("Preset name \"" <> name <> "\" produces an empty record key"))
      { agent, did } <- Repo.requireAgent ctx (authDid input)
      existing <- Repo.getExisting agent did collection rkey
      now <- Repo.nowIso
      let record = makeRecord body (Repo.recordValue collection existing) (trim name) now
      repo <- liftEffect (Api.assertDid agent)
      result <- Api.putRecord agent { repo, collection, rkey, record, swapRecord: Repo.swapRecord existing, validate: false }
      pure (Json (mergeForeign (List.pickView record) (toForeign { uri: result.uri, rkey })))
  }
  where
  collection = "app.rocksky.equalizer"

makeRecord :: Foreign -> Foreign -> String -> String -> Foreign
makeRecord input existing name now = toForeign
  { "$type": "app.rocksky.equalizer"
  , name
  , precut: nonNullField "precut" input existing
  , bands: field "bands" input
  , createdAt: fromMaybe now (readStringAt "createdAt" existing)
  , updatedAt: now
  }
