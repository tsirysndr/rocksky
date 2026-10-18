-- | Bindings for `libsodium-wrappers`: secretbox (XSalsa20-Poly1305),
-- | random bytes and the hex/base64 codecs. Byte arrays are Node Buffers.
-- |
-- | Every call except `ready` requires the wasm to be initialised: run
-- | `ready` once first (the constants are undefined before that, hence `Effect`).
module Libsodium
  ( ready
  , cryptoSecretboxNonceBytes
  , cryptoSecretboxKeyBytes
  , cryptoSecretboxMacBytes
  , randombytesBuf
  , cryptoSecretboxEasy
  , cryptoSecretboxEasyString
  , cryptoSecretboxOpenEasy
  , cryptoSecretboxKeygen
  , fromHex
  , toHex
  , fromBase64
  , toBase64
  , fromString
  , toString
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)
import Node.Buffer (Buffer)

foreign import readyImpl :: Effect (Promise Unit)

-- | `await sodium.ready`.
ready :: Aff Unit
ready = toAffE readyImpl

-- | `sodium.crypto_secretbox_NONCEBYTES` (24).
foreign import cryptoSecretboxNonceBytes :: Effect Int

-- | `sodium.crypto_secretbox_KEYBYTES` (32).
foreign import cryptoSecretboxKeyBytes :: Effect Int

-- | `sodium.crypto_secretbox_MACBYTES` (16).
foreign import cryptoSecretboxMacBytes :: Effect Int

-- | `sodium.randombytes_buf(n)`.
foreign import randombytesBuf :: Int -> Effect Buffer

-- | `sodium.crypto_secretbox_easy(message, nonce, key)`.
foreign import cryptoSecretboxEasy :: Buffer -> Buffer -> Buffer -> Effect Buffer

-- | `crypto_secretbox_easy` with a UTF-8 string message.
foreign import cryptoSecretboxEasyString :: String -> Buffer -> Buffer -> Effect Buffer

-- | `sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)`; throws
-- | when the MAC does not verify (wrong key or tampered data).
foreign import cryptoSecretboxOpenEasy :: Buffer -> Buffer -> Buffer -> Effect Buffer

-- | `sodium.crypto_secretbox_keygen()`.
foreign import cryptoSecretboxKeygen :: Effect Buffer

-- | `sodium.from_hex(s)`; throws on invalid input.
foreign import fromHex :: String -> Effect Buffer

-- | `sodium.to_hex(bytes)`.
foreign import toHex :: Buffer -> Effect String

-- | `sodium.from_base64(s)` with the default URLSAFE_NO_PADDING variant;
-- | throws on invalid input.
foreign import fromBase64 :: String -> Effect Buffer

-- | `sodium.to_base64(bytes)` (URLSAFE_NO_PADDING).
foreign import toBase64 :: Buffer -> Effect String

-- | `sodium.from_string(s)` (UTF-8).
foreign import fromString :: String -> Effect Buffer

-- | `sodium.to_string(bytes)` (UTF-8).
foreign import toString :: Buffer -> Effect String
