-- | Helpers shared by the XRPC method handlers.
module Rocksky.Xrpc.Util
  ( params
  , inputBody
  , inputRecord
  , authDid
  , json
  , failure
  , reqHeader
  , paramString
  , paramInt
  , paramBool
  , paramStringArray
  , missingDid
  ) where

import Prelude

import Atproto.XrpcServer (HandlerInput, HandlerOutput(..), credentialsDid)
import Data.Maybe (Maybe(..))
import Data.Nullable (toMaybe)
import Express as Express
import Foreign (Foreign)
import Rocksky.Lib.Foreign (asArray, asString, path, readBooleanAt, readIntAt, readStringAt, toForeign, unsafeFromForeign)
import Data.Array (mapMaybe)

-- | The validated query/procedure params as a record. `@atproto/xrpc-server`
-- | has already checked them against the lexicon, so the shape is the one the
-- | lexicon JSON declares; the record type next to each handler documents it.
-- | Optional params are `Nullable` (absent → undefined, read as null).
params :: forall r. HandlerInput -> Record r
params i = unsafeFromForeign i.params

inputBody :: HandlerInput -> Maybe Foreign
inputBody i = _.body <$> toMaybe i.input

-- | The procedure body as a record (validated by the lexicon, like `params`).
inputRecord :: forall r. HandlerInput -> Maybe (Record r)
inputRecord i = unsafeFromForeign <$> inputBody i

authDid :: HandlerInput -> Maybe String
authDid i = credentialsDid i.auth

json :: forall a. a -> HandlerOutput
json = Json <<< toForeign

failure :: Int -> String -> HandlerOutput
failure = Failure

missingDid :: HandlerOutput
missingDid = Failure 400 "Missing authenticated DID."

reqHeader :: HandlerInput -> String -> Maybe String
reqHeader i = Express.reqHeader i.req

paramString :: HandlerInput -> String -> Maybe String
paramString i k = readStringAt k i.params

paramInt :: HandlerInput -> String -> Maybe Int
paramInt i k = readIntAt k i.params

paramBool :: HandlerInput -> String -> Maybe Boolean
paramBool i k = readBooleanAt k i.params

-- | A repeated query param (`?uris=a&uris=b`); a single value is one element.
paramStringArray :: HandlerInput -> String -> Array String
paramStringArray i k = case readStringAt k i.params of
  Just s -> [ s ]
  Nothing -> case path k i.params >>= asArray of
    Just xs -> mapMaybe asString xs
    Nothing -> []
