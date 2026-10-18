-- | Some PDS hosts are unreachable from the production server (network/geo
-- | filtering on their side). For those we keep the *logical* URL untouched and
-- | only swap the host we physically connect to, routing through a reverse
-- | proxy that forwards the request verbatim and restores the upstream `Host`.
-- |
-- | The swap happens at the fetch layer: `@atproto/oauth-client` validates
-- | that the protected-resource metadata names the origin it asked for, and
-- | DPoP proofs bind `htu` to the request URL, so neither may see the proxy.
-- |
-- | Configure with `PDS_HOST_OVERRIDES="unreachable.host=proxy.host,other=proxy2"`
-- | or "" to disable.
module Rocksky.Lib.PdsProxy
  ( pdsHostOverrides
  , parseOverrides
  , pdsProxyFetch
  , installPdsProxyFetch
  ) where

import Prelude

import Consola as Consola
import Data.Array (catMaybes, filter)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), joinWith, split, toLower, trim)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Foreign.Object (Object)
import Foreign.Object as Object
import Rocksky.Lib.Env (env)

parseOverrides :: String -> Map String String
parseOverrides raw = Map.fromFoldable $ catMaybes $ map entry $ filter (_ /= "") $ map trim (split (Pattern ",") raw)
  where
  entry e = case map (toLower <<< trim) (split (Pattern "=") e) of
    [ from, to ] | from /= "" && to /= "" -> Just (Tuple from to)
    _ -> unsafePerformEffect do
      Consola.warn ("Ignoring malformed PDS_HOST_OVERRIDES entry: \"" <> e <> "\"")
      pure Nothing

pdsHostOverrides :: Map String String
pdsHostOverrides = parseOverrides env."PDS_HOST_OVERRIDES"

toObject :: Map String String -> Object String
toObject m = Object.fromFoldable (Map.toUnfoldable m :: Array (Tuple String String))

foreign import createPdsProxyFetch :: Object String -> Foreign
foreign import installFetch :: Foreign -> Effect Unit

-- | Shared fetch wrapper, so passing it explicitly (to the OAuth client)
-- | after `installPdsProxyFetch` cannot double-wrap the global.
pdsProxyFetch :: Foreign
pdsProxyFetch = createPdsProxyFetch (toObject pdsHostOverrides)

-- | Route unreachable PDS hosts through their proxy for every `fetch` caller.
installPdsProxyFetch :: Effect Unit
installPdsProxyFetch =
  when (not (Map.isEmpty pdsHostOverrides)) do
    installFetch pdsProxyFetch
    Consola.info $ "PDS host overrides active: " <> joinWith ", "
      (map (\(Tuple k v) -> k <> " -> " <> v) (Map.toUnfoldable pdsHostOverrides :: Array (Tuple String String)))
