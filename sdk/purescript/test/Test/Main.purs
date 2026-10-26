module Test.Main where

import Prelude
import Data.Argonaut.Core (Json, jsonNull)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, bracket, launchAff_)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Effect.Exception (throw)
import Rocksky.Client (RockskyError(..), defaultConfig, newClient, query)
import Rocksky.API.Actor.GetProfile as Profile
import Rocksky.API.Playlist.CreatePlaylist as Playlist
import Rocksky.API.Scrobble.CreateScrobble as Scrobble
import Rocksky.API.Scrobble.GetScrobbles as Feed

type Fixture = { baseUrl :: String, close :: Effect Unit }

foreign import startServer :: EffectFnAff Fixture

assert :: String -> Boolean -> Aff Unit
assert label passed = unless passed $ liftEffect $ throw label

expectRight :: forall a. Either RockskyError a -> Aff a
expectRight (Left err) = liftEffect $ throw $ show err
expectRight (Right value) = pure value

main :: Effect Unit
main = launchAff_ $ bracket (fromEffectFnAff startServer) (liftEffect <<< _.close) \fixture -> do
  let client = newClient (defaultConfig { baseUrl = fixture.baseUrl, token = Just "test-token" })
  profile <- Profile.call client ((Profile.defaultParams {}) { did = Just "alice.test & music" }) >>= expectRight
  assert "typed profile decoding" $ profile.did == Just "did:plc:alice" && profile.avatar == Nothing
  scrobble <- Scrobble.call client {} ((Scrobble.defaultInput { title: "One More Time", artist: "Daft Punk" }) { timestamp = Just 2200000000.0 }) >>= expectRight
  assert "typed scrobble and optional input omission" $ scrobble.title == Just "One More Time"
  playlist <- Playlist.call client (Playlist.defaultParams { name: "Favorites & more" }) >>= expectRight
  assert "query-only procedure" $ playlist.cid == "test-cid"
  feed <- Feed.call client ((Feed.defaultParams {}) { following = Just false, offset = Just 0.0 }) >>= expectRight
  assert "false and zero query parameters" $ map lengthArray feed.scrobbles == Just 0
  denied <- query client "test.api.denied" {} :: Aff (Either RockskyError Json)
  assert "structured HTTP errors" case denied of
    Left (ResponseError err) -> err.status == 401 && err.error == Just "AuthRequired" && err.message == Just "Please authenticate"
    _ -> false
  html <- query client "test.api.html" {} :: Aff (Either RockskyError Json)
  assert "non-JSON HTTP errors retain status and body" case html of
    Left (ResponseError err) -> err.status == 502 && err.body == "upstream unavailable"
    _ -> false
  invalid <- query client "test.api.invalid" {} :: Aff (Either RockskyError Json)
  assert "malformed JSON fails" case invalid of
    Left (DecodeError _) -> true
    _ -> false
  schema <- query client "test.api.schema" {} :: Aff (Either RockskyError { count :: Int })
  assert "response type mismatch fails" case schema of
    Left (DecodeError _) -> true
    _ -> false
  empty <- query client "test.api.empty" {} >>= expectRight
  assert "empty successful response" $ empty == jsonNull
  liftEffect $ log "SDK integration tests passed."

foreign import lengthArray :: forall a. Array a -> Int
