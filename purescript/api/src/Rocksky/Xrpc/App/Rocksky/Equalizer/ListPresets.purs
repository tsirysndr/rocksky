module Rocksky.Xrpc.App.Rocksky.Equalizer.ListPresets (register, pickView) where

import Prelude
import Atproto.Api as Api
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Array (last, length, mapMaybe, sortBy)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (null, toMaybe)
import Data.String (Pattern(..), split)
import Effect (Effect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign (mergeForeign, readStringAt, toForeign)
import Rocksky.Lib.RepoSettings as Repo
import Rocksky.Lib.JsonRecord (pick)
import Rocksky.Xrpc.Util (authDid, paramString)

foreign import localeCompare :: String -> String -> Int

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.equalizer.listPresets"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let requested = paramString input "did"
      if fromMaybe "" requested == "" && fromMaybe "" (authDid input) == "" then
        pure (FailureNamed 401 "AuthRequired" "Provide a `did` param for public access or include an auth token.")
      else Json <$> recoverWith (toForeign { presets: [] :: Array Foreign })
        ( timeoutMs 10000 do
            did <- Repo.resolveDid ctx requested (authDid input)
            agent <- Repo.publicAgent ctx did
            presets <- retrieve agent did null []
            pure (toForeign { presets: sortBy (\a b -> compare (localeCompare (name a) (name b)) 0) presets })
        )
  }
  where
  collection = "app.rocksky.equalizer"
  name = fromMaybe "" <<< readStringAt "name"
  retrieve agent did cursor acc = do
    page <- Api.listRecords agent { repo: did, collection, limit: 100, cursor }
    let presets = acc <> mapMaybe present page.records
    case toMaybe page.cursor of
      Just next | next /= "" && length presets < 500 -> retrieve agent did page.cursor presets
      _ -> pure presets
  present rec
    | Repo.isRecord collection rec.value = Just $ mergeForeign
        (pickView rec.value)
        (toForeign { uri: rec.uri, rkey: fromMaybe "" (last (split (Pattern "/") rec.uri)) })
    | otherwise = Nothing

pickView :: Foreign -> Foreign
pickView = pick [ "name", "precut", "bands", "createdAt", "updatedAt" ]
