//// Binding to `node:crypto`.

import gleam/javascript/promise.{type Promise}
import rocksky_api/node/js.{type Exception}

/// Hex SHA-256 of a UTF-8 string.
@external(javascript, "./crypto_ffi.mjs", "sha256Hex")
pub fn sha256_hex(input: String) -> String

@external(javascript, "./crypto_ffi.mjs", "sha256HexBytes")
pub fn sha256_hex_bytes(input: BitArray) -> String

@external(javascript, "./crypto_ffi.mjs", "md5Hex")
pub fn md5_hex(input: String) -> String

@external(javascript, "./crypto_ffi.mjs", "randomBytesHex")
pub fn random_bytes_hex(size: Int) -> String

@external(javascript, "./crypto_ffi.mjs", "randomBytesBase64Url")
pub fn random_bytes_base64url(size: Int) -> String

@external(javascript, "./crypto_ffi.mjs", "randomUuid")
pub fn random_uuid() -> String

@external(javascript, "./crypto_ffi.mjs", "timingSafeEqual")
pub fn timing_safe_equal(a: String, b: String) -> Bool

/// AES-256-CTR with a hex key and hex IV; returns hex.
@external(javascript, "./crypto_ffi.mjs", "aesCtrEncrypt")
pub fn aes_ctr_encrypt(
  text: String,
  key_hex: String,
  iv_hex: String,
) -> Result(String, Exception)

@external(javascript, "./crypto_ffi.mjs", "aesCtrDecrypt")
pub fn aes_ctr_decrypt(
  encrypted_hex: String,
  key_hex: String,
  iv_hex: String,
) -> Result(String, Exception)

@external(javascript, "./crypto_ffi.mjs", "hmacSha256Hex")
pub fn hmac_sha256_hex(key: String, data: String) -> String

/// libsodium `crypto_secretbox_easy` with a random nonce, base64 output.
@external(javascript, "./crypto_ffi.mjs", "secretboxEncrypt")
pub fn secretbox_encrypt(
  plaintext: String,
  key_hex: String,
) -> Promise(Result(String, Exception))

@external(javascript, "./crypto_ffi.mjs", "secretboxDecrypt")
pub fn secretbox_decrypt(
  encoded: String,
  key_hex: String,
) -> Promise(Result(String, Exception))
