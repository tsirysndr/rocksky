-- | The parts of `node:crypto` the API uses.
module Node.Crypto
  ( sha256Hex
  , md5Hex
  , hashHex
  , hashBufferHex
  , randomUUID
  , randomBytesHex
  , randomBytes
  , timingSafeEqualStrings
  , Cipher
  , createCipheriv
  , createDecipheriv
  , cipherUpdateString
  , cipherFinal
  , hmacSha256Hex
  ) where

import Effect (Effect)
import Node.Buffer (Buffer)

-- | `createHash("sha256").update(s).digest("hex")`.
sha256Hex :: String -> String
sha256Hex = hashHex "sha256"

md5Hex :: String -> String
md5Hex = hashHex "md5"

foreign import hashHex :: String -> String -> String

-- | Digest of a buffer, as hex.
foreign import hashBufferHex :: String -> Buffer -> String

foreign import randomUUID :: Effect String

-- | `randomBytes(n).toString("hex")`.
foreign import randomBytesHex :: Int -> Effect String

foreign import randomBytes :: Int -> Effect Buffer

-- | Constant-time equality of two strings (after utf-8 encoding); false when
-- | the lengths differ.
foreign import timingSafeEqualStrings :: String -> String -> Boolean

foreign import data Cipher :: Type

-- | `createCipheriv(algorithm, keyHex, ivHex)`; key and iv are hex strings.
foreign import createCipheriv :: String -> String -> String -> Effect Cipher
foreign import createDecipheriv :: String -> String -> String -> Effect Cipher

-- | `cipher.update(input, inputEncoding, outputEncoding)`.
foreign import cipherUpdateString :: Cipher -> String -> String -> String -> Effect String

-- | `cipher.final(outputEncoding)`.
foreign import cipherFinal :: Cipher -> String -> Effect String

foreign import hmacSha256Hex :: String -> String -> String
