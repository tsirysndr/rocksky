module Rocksky.Tealfm.Index (publishPlayingNow) where

import Prelude
import Atproto.Api as Api
import Data.Maybe (Maybe(..))
import Data.String (toLower)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.DurableSubmission (enqueueTealSubmission)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (stringify, toForeign)
import Rocksky.Tealfm.Publication (tealRecord)
import Rocksky.Tealfm.PushEnabled (isTealPushEnabled)
import Rocksky.Types.Track (MusicbrainzTrack)

publishPlayingNow :: Context -> Api.Agent -> MusicbrainzTrack -> Number -> Maybe String -> Aff Unit
publishPlayingNow ctx agent track duration identity = do
  did <- liftEffect (Api.assertDid agent)
  enabled <- isTealPushEnabled ctx did
  when enabled do
    let
      key = case identity of
        Just value -> value
        Nothing -> sha256Hex (stringify (toForeign [ toForeign did, toForeign (toLower track.name), toForeign (map (toLower <<< _.name) track.artist), toForeign (toLower track.album), toForeign track.timestamp ]))
    record <- tealRecord ctx track duration
    void (enqueueTealSubmission { url: env."SUBMISSIONS_URL", secret: env."SUBMISSIONS_SECRET" } did record key)
