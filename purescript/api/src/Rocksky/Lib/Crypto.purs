-- | AES-256-CTR with the fixed SPOTIFY_ENCRYPTION_IV (`src/lib/crypto.ts`).
module Rocksky.Lib.Crypto (encrypt, decrypt) where

import Prelude

import Effect (Effect)
import Node.Crypto (cipherFinal, cipherUpdateString, createCipheriv, createDecipheriv)
import Rocksky.Lib.Env (env)

encrypt :: String -> String -> Effect String
encrypt text key = do
  cipher <- createCipheriv "aes-256-ctr" key env."SPOTIFY_ENCRYPTION_IV"
  a <- cipherUpdateString cipher text "utf8" "hex"
  b <- cipherFinal cipher "hex"
  pure (a <> b)

decrypt :: String -> String -> Effect String
decrypt encrypted key = do
  decipher <- createDecipheriv "aes-256-ctr" key env."SPOTIFY_ENCRYPTION_IV"
  a <- cipherUpdateString decipher encrypted "hex" "utf8"
  b <- cipherFinal decipher "utf8"
  pure (a <> b)
