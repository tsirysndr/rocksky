module Rocksky.Cli.Command.Sync (run, runWith, Operations) where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Array (length)
import Data.Foldable (for_)
import Effect (Effect)
import Effect.Aff (Aff, finally)
import Foreign (Foreign)
import Rocksky.Lib.Foreign as F

-- Persistence and CAR decoding are behind these capabilities; ordering and
-- lock lifetime are controlled here and can be tested without a PDS or disk.
type Operations =
  { identity :: Aff { did :: String, handle :: String }
  , agent :: String -> String -> Aff Foreign
  , user :: Foreign -> String -> String -> Aff Foreign
  , subscribe :: Foreign -> Aff Unit
  , download :: Foreign -> Aff Foreign
  , records :: String -> Foreign -> Foreign -> Aff (Array Foreign)
  , acquire :: String -> Aff Unit
  , release :: String -> Aff Unit
  , insert :: String -> Array Foreign -> Foreign -> Aff Unit
  , log :: String -> Aff Unit
  }

runWith :: Operations -> Aff Unit
runWith ops = do
  identity <- ops.identity
  agent <- ops.agent identity.did identity.handle
  user <- ops.user agent identity.did identity.handle
  ops.subscribe user
  ops.log ("DID: " <> identity.did <> "\nHandle: " <> identity.handle)
  car <- ops.download agent
  artists <- ops.records "Artists" agent car
  albums <- ops.records "Albums" agent car
  songs <- ops.records "Songs" agent car
  scrobbles <- ops.records "Scrobbles" agent car
  let collections = [ { name: "Artists", records: artists }, { name: "Albums", records: albums }, { name: "Songs", records: songs }, { name: "Scrobbles", records: scrobbles } ]
  for_ collections \entry -> ops.log (entry.name <> ": " <> show (length entry.records))
  ops.acquire identity.did
  finally (ops.release identity.did) $ for_ collections \entry -> ops.insert entry.name entry.records user

foreign import identityImpl :: Effect (Promise { did :: String, handle :: String })
foreign import callImpl :: String -> Array Foreign -> Effect (Promise Foreign)
foreign import lockImpl :: Boolean -> String -> Effect (Promise Unit)

run :: Aff Unit
run = runWith
  { identity: toAffE identityImpl
  , agent: \did handle -> call "agent" [ F.toForeign did, F.toForeign handle ]
  , user: \agent did handle -> call "createUser" [ agent, F.toForeign did, F.toForeign handle ]
  , subscribe: \user -> void $ call "subscribeToJetstream" [ user ]
  , download: \agent -> call "downloadCarFile" [ agent ]
  , records: \name agent car -> F.unsafeFromForeign <$> call ("getRockskyUser" <> name) [ agent, car ]
  , acquire: \did -> toAffE (lockImpl true did)
  , release: \did -> toAffE (lockImpl false did)
  , insert: \name records user -> void $ call ("create" <> name) [ F.toForeign records, user ]
  , log: \message -> toAffE (logImpl message)
  }
  where
  call name arguments = toAffE (callImpl name arguments)

foreign import logImpl :: String -> Effect (Promise Unit)
