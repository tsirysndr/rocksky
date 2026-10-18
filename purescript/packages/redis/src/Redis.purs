-- | Bindings for `redis` (node-redis v4): the client, the commands the API
-- | uses, `multi` pipelines and `eval`.
module Redis
  ( Client
  , createClient
  , connect
  , onError
  , quit
  , get
  , set
  , setEx
  , setNX
  , del
  , delMany
  , incr
  , ttl
  , expire
  , exists
  , keys
  , publish
  , subscribe
  , eval
  , Multi
  , multi
  , zAdd
  , zRemRangeByScore
  , zCard
  , multiExpire
  , exec
  , duplicate
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn2, mkEffectFn1, runEffectFn2)
import Foreign (Foreign)

foreign import data Client :: Type
foreign import data Multi :: Type

-- | `createClient({ url })`.
foreign import createClient :: String -> Effect Client

foreign import connectImpl :: Client -> Effect (Promise Client)

connect :: Client -> Aff Client
connect c = toAffE (connectImpl c)

foreign import onErrorImpl :: EffectFn2 Client (EffectFn1 Foreign Unit) Unit

onError :: Client -> (Foreign -> Effect Unit) -> Effect Unit
onError c f = runEffectFn2 onErrorImpl c (mkEffectFn1 f)

foreign import quitImpl :: Client -> Effect (Promise Unit)

quit :: Client -> Aff Unit
quit c = toAffE (quitImpl c)

-- | A fresh client with the same options (needed for subscriptions).
foreign import duplicate :: Client -> Effect Client

foreign import getImpl :: Client -> String -> Effect (Promise (Nullable String))

get :: Client -> String -> Aff (Maybe String)
get c k = toMaybe <$> toAffE (getImpl c k)

foreign import setImpl :: Client -> String -> String -> Effect (Promise Unit)

set :: Client -> String -> String -> Aff Unit
set c k v = toAffE (setImpl c k v)

-- | `set(key, value, { EX: seconds })`.
foreign import setExImpl :: Client -> String -> Int -> String -> Effect (Promise Unit)

setEx :: Client -> String -> Int -> String -> Aff Unit
setEx c k s v = toAffE (setExImpl c k s v)

-- | `set(key, value, { NX: true, EX: seconds })`; true when the key was set.
foreign import setNXImpl :: Client -> String -> String -> Int -> Effect (Promise Boolean)

setNX :: Client -> String -> String -> Int -> Aff Boolean
setNX c k v s = toAffE (setNXImpl c k v s)

foreign import delImpl :: Client -> Array String -> Effect (Promise Int)

del :: Client -> String -> Aff Int
del c k = toAffE (delImpl c [ k ])

delMany :: Client -> Array String -> Aff Int
delMany c ks = toAffE (delImpl c ks)

foreign import incrImpl :: Client -> String -> Effect (Promise Int)

incr :: Client -> String -> Aff Int
incr c k = toAffE (incrImpl c k)

foreign import ttlImpl :: Client -> String -> Effect (Promise Int)

ttl :: Client -> String -> Aff Int
ttl c k = toAffE (ttlImpl c k)

foreign import expireImpl :: Client -> String -> Int -> Effect (Promise Boolean)

expire :: Client -> String -> Int -> Aff Boolean
expire c k s = toAffE (expireImpl c k s)

foreign import existsImpl :: Client -> String -> Effect (Promise Int)

exists :: Client -> String -> Aff Boolean
exists c k = (_ > 0) <$> toAffE (existsImpl c k)

foreign import keysImpl :: Client -> String -> Effect (Promise (Array String))

keys :: Client -> String -> Aff (Array String)
keys c p = toAffE (keysImpl c p)

foreign import publishImpl :: Client -> String -> String -> Effect (Promise Int)

publish :: Client -> String -> String -> Aff Int
publish c ch m = toAffE (publishImpl c ch m)

foreign import subscribeImpl :: Client -> String -> EffectFn2 String String Unit -> Effect (Promise Unit)

-- | `client.subscribe(channel, (message, channel) => ...)`. The client must
-- | be a dedicated one (`duplicate`).
subscribe :: Client -> String -> (String -> String -> Effect Unit) -> Aff Unit
subscribe c ch f = toAffE (subscribeImpl c ch (mkFn2Impl f))

foreign import mkFn2Impl :: forall a b. (a -> b -> Effect Unit) -> EffectFn2 a b Unit

foreign import evalImpl :: Client -> String -> Array String -> Array String -> Effect (Promise Foreign)

-- | `client.eval(script, { keys, arguments })`.
eval :: Client -> String -> Array String -> Array String -> Aff Foreign
eval c script ks args = toAffE (evalImpl c script ks args)

foreign import multi :: Client -> Effect Multi

-- | `.zAdd(key, { score, value })`.
foreign import zAdd :: Multi -> String -> Number -> String -> Effect Multi
foreign import zRemRangeByScore :: Multi -> String -> Number -> Number -> Effect Multi
foreign import zCard :: Multi -> String -> Effect Multi
foreign import multiExpire :: Multi -> String -> Int -> Effect Multi

foreign import execImpl :: Multi -> Effect (Promise (Array Foreign))

exec :: Multi -> Aff (Array Foreign)
exec m = toAffE (execImpl m)
