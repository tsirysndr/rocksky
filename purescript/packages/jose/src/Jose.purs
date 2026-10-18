-- | Bindings for `jose`: JWK import/export, key generation, `SignJWT` and
-- | `jwtVerify`. JWKs and JWT payloads cross the FFI as `Foreign` objects.
module Jose
  ( KeyLike
  , importJWK
  , exportJWK
  , KeyPair
  , GenerateKeyPairOptions
  , generateKeyPair
  , SignJWT
  , ProtectedHeader
  , newSignJWT
  , setProtectedHeader
  , setIssuedAt
  , setIssuer
  , setAudience
  , setSubject
  , setJti
  , setExpirationTime
  , setNotBefore
  , sign
  , VerifyOptions
  , VerifyResult
  , jwtVerify
  , decodeJwt
  , decodeProtectedHeader
  ) where

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

-- | A `CryptoKey` / `KeyObject` as returned by `importJWK`/`generateKeyPair`.
foreign import data KeyLike :: Type

foreign import importJWKImpl :: Foreign -> Nullable String -> Effect (Promise KeyLike)

-- | `importJWK(jwk, alg)`; `alg` may be null when the JWK carries its own.
importJWK :: Foreign -> Nullable String -> Aff KeyLike
importJWK jwk alg = toAffE (importJWKImpl jwk alg)

foreign import exportJWKImpl :: KeyLike -> Effect (Promise Foreign)

-- | `exportJWK(key)`: the public parameters (and private ones for a private key).
exportJWK :: KeyLike -> Aff Foreign
exportJWK k = toAffE (exportJWKImpl k)

type KeyPair = { publicKey :: KeyLike, privateKey :: KeyLike }

-- | `crv` for EC/OKP algorithms, `modulusLength` for RSA; `extractable`
-- | must be true to `exportJWK` a generated private key.
type GenerateKeyPairOptions =
  { crv :: Nullable String
  , modulusLength :: Nullable Int
  , extractable :: Nullable Boolean
  }

foreign import generateKeyPairImpl :: String -> GenerateKeyPairOptions -> Effect (Promise KeyPair)

-- | `generateKeyPair(alg, { crv, modulusLength, extractable })`.
generateKeyPair :: String -> GenerateKeyPairOptions -> Aff KeyPair
generateKeyPair alg o = toAffE (generateKeyPairImpl alg o)

-- | A mutable `SignJWT` builder.
foreign import data SignJWT :: Type

type ProtectedHeader = { alg :: String, kid :: Nullable String, typ :: Nullable String }

-- | `new SignJWT(payload)`.
foreign import newSignJWT :: Foreign -> Effect SignJWT

-- | `.setProtectedHeader({ alg, kid, typ })`.
foreign import setProtectedHeader :: SignJWT -> ProtectedHeader -> Effect SignJWT

-- | `.setIssuedAt()` (now).
foreign import setIssuedAt :: SignJWT -> Effect SignJWT

foreign import setIssuer :: SignJWT -> String -> Effect SignJWT
foreign import setAudience :: SignJWT -> String -> Effect SignJWT
foreign import setSubject :: SignJWT -> String -> Effect SignJWT
foreign import setJti :: SignJWT -> String -> Effect SignJWT

-- | `.setExpirationTime(input)`: a span like "2h" or an epoch-seconds string.
foreign import setExpirationTime :: SignJWT -> String -> Effect SignJWT

-- | `.setNotBefore(input)`, same forms as `setExpirationTime`.
foreign import setNotBefore :: SignJWT -> String -> Effect SignJWT

foreign import signImpl :: SignJWT -> KeyLike -> Effect (Promise String)

-- | `.sign(key)` → the compact JWS.
sign :: SignJWT -> KeyLike -> Aff String
sign j k = toAffE (signImpl j k)

type VerifyOptions =
  { issuer :: Nullable String
  , audience :: Nullable String
  , subject :: Nullable String
  , algorithms :: Nullable (Array String)
  , clockTolerance :: Nullable String
  , maxTokenAge :: Nullable String
  }

type VerifyResult = { payload :: Foreign, protectedHeader :: Foreign }

foreign import jwtVerifyImpl :: String -> KeyLike -> VerifyOptions -> Effect (Promise VerifyResult)

-- | `jwtVerify(jwt, key, options)`; rejects with a `jose.errors.*` error on
-- | a bad signature or failed claim check.
jwtVerify :: String -> KeyLike -> VerifyOptions -> Aff VerifyResult
jwtVerify jwt k o = toAffE (jwtVerifyImpl jwt k o)

-- | `decodeJwt(jwt)`: the payload without verification; throws on malformed input.
foreign import decodeJwt :: String -> Effect Foreign

-- | `decodeProtectedHeader(jwt)`.
foreign import decodeProtectedHeader :: String -> Effect Foreign
