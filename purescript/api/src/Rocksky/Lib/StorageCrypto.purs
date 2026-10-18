-- | Encryption at rest for BYO storage credentials (`src/lib/storage-crypto.ts`):
-- | libsodium secretbox with STORAGE_ENCRYPTION_KEY, stored as
-- | base64(nonce ‖ ciphertext) in the URLSAFE_NO_PADDING variant.
module Rocksky.Lib.StorageCrypto (encryptCredential, decryptCredential) where

import Prelude

import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Libsodium as Sodium
import Node.Buffer as Buffer
import Rocksky.Lib.Env (env)

getKey :: Aff Buffer.Buffer
getKey = do
  Sodium.ready
  liftEffect (Sodium.fromHex env."STORAGE_ENCRYPTION_KEY")

encryptCredential :: String -> Aff String
encryptCredential plaintext = do
  key <- getKey
  liftEffect do
    nonceBytes <- Sodium.cryptoSecretboxNonceBytes
    nonce <- Sodium.randombytesBuf nonceBytes
    ciphertext <- Sodium.cryptoSecretboxEasyString plaintext nonce key
    combined <- Buffer.concat [ nonce, ciphertext ]
    Sodium.toBase64 combined

-- | Throws when the MAC does not verify (wrong key or tampered value).
decryptCredential :: String -> Aff String
decryptCredential encoded = do
  key <- getKey
  liftEffect do
    nonceBytes <- Sodium.cryptoSecretboxNonceBytes
    combined <- Sodium.fromBase64 encoded
    len <- Buffer.size combined
    let
      nonce = Buffer.slice 0 nonceBytes combined
      ciphertext = Buffer.slice nonceBytes len combined
    plaintext <- Sodium.cryptoSecretboxOpenEasy ciphertext nonce key
    Sodium.toString plaintext
