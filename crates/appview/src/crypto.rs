//! Credential encryption, compatible with `apps/api`.
//!
//! The port of `apps/api/src/lib/storage-crypto.ts`, which uses libsodium's
//! `crypto_secretbox_easy`. Being byte-compatible matters because both servers
//! read the same rows: `access_tokens.token_encrypted` and a user's
//! bring-your-own-storage credentials are written by one and may be read by
//! the other.
//!
//! The same format is already read by `crates/navidrome/src/s3.rs` and
//! `crates/mirror/src/crypto.rs`; those are the canonical notes on its traps
//! and agree with what is here. This module differs only in also *writing* it,
//! which the others never need to — minting an access token has to store an
//! encrypted copy.
//!
//! The format is libsodium's, not a choice made here:
//!
//! - **XSalsa20-Poly1305** with a 32-byte key, taken from
//!   `STORAGE_ENCRYPTION_KEY` as hex.
//! - A random **24-byte nonce**, prepended to the ciphertext, which itself is
//!   **MAC-first**. The `xsalsa20poly1305` crate lays the tag out the same way
//!   libsodium does, so the bytes pass straight through; rearranging them to a
//!   supposed "tag-last RustCrypto format" is the mistake
//!   `crates/navidrome/src/s3.rs` documents having made, and it scrambles every
//!   existing credential.
//! - The pair encoded as **base64url without padding**, which is what
//!   `libsodium-wrappers`' `to_base64` produces by default — the easy thing to
//!   get wrong here is assuming standard base64.

use base64::Engine;
use xsalsa20poly1305::aead::{Aead, KeyInit};
use xsalsa20poly1305::{Key, Nonce, XSalsa20Poly1305};

/// libsodium's `crypto_secretbox_NONCEBYTES`.
const NONCE_BYTES: usize = 24;
/// libsodium's `crypto_secretbox_KEYBYTES`.
pub const KEY_BYTES: usize = 32;

/// The base64 flavour `libsodium-wrappers` defaults to.
const BASE64: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error(
        "the storage encryption key must be {expected} bytes as hex \
         ({hex_len} hex characters), but {got} was given"
    )]
    KeyLength {
        expected: usize,
        hex_len: usize,
        got: usize,
    },
    #[error("the storage encryption key is not valid hex: {0}")]
    KeyEncoding(#[from] hex::FromHexError),
    #[error("the stored value is not valid base64: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("the stored value is too short to contain a nonce")]
    Truncated,
    #[error("decryption failed: wrong key, or the value was tampered with")]
    Decrypt,
    #[error("encryption failed")]
    Encrypt,
}

/// Parses the hex key.
fn parse_key(hex_key: &str) -> Result<Key, CryptoError> {
    let bytes = hex::decode(hex_key.trim())?;
    if bytes.len() != KEY_BYTES {
        return Err(CryptoError::KeyLength {
            expected: KEY_BYTES,
            hex_len: KEY_BYTES * 2,
            got: bytes.len(),
        });
    }
    Ok(*Key::from_slice(&bytes))
}

/// Encrypts `plaintext`, returning `base64url(nonce || ciphertext)`.
pub fn encrypt_credential(hex_key: &str, plaintext: &str) -> Result<String, CryptoError> {
    use rand::RngCore;

    let key = parse_key(hex_key)?;
    let cipher = XSalsa20Poly1305::new(&key);

    let mut nonce_bytes = [0u8; NONCE_BYTES];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| CryptoError::Encrypt)?;

    let mut combined = Vec::with_capacity(NONCE_BYTES + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

/// Decrypts a value produced by [`encrypt_credential`] or by `apps/api`.
pub fn decrypt_credential(hex_key: &str, encoded: &str) -> Result<String, CryptoError> {
    let key = parse_key(hex_key)?;
    let cipher = XSalsa20Poly1305::new(&key);

    let combined = decode_base64_permissive(encoded.trim())?;

    if combined.len() <= NONCE_BYTES {
        return Err(CryptoError::Truncated);
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_BYTES);
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| CryptoError::Decrypt)?;

    String::from_utf8(plaintext).map_err(|_| CryptoError::Decrypt)
}

/// Tries every base64 flavour, as `crates/mirror/src/crypto.rs` does.
///
/// libsodium writes URL-safe unpadded, but a value may have come from other
/// tooling, and a credential that fails to decode is indistinguishable from a
/// wrong key at the call site.
fn decode_base64_permissive(encoded: &str) -> Result<Vec<u8>, CryptoError> {
    use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};

    for engine in [&URL_SAFE_NO_PAD, &URL_SAFE, &STANDARD_NO_PAD, &STANDARD] {
        if let Ok(bytes) = engine.decode(encoded) {
            return Ok(bytes);
        }
    }
    // Reported through the default engine so the error names a real reason.
    Err(CryptoError::Base64(
        URL_SAFE_NO_PAD.decode(encoded).unwrap_err(),
    ))
}

/// A fresh random key, hex encoded — the shape `STORAGE_ENCRYPTION_KEY` wants.
pub fn generate_key() -> String {
    use rand::RngCore;

    let mut bytes = [0u8; KEY_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    #[test]
    fn a_value_round_trips() {
        let encrypted = encrypt_credential(KEY, "hunter2").unwrap();
        assert_eq!(decrypt_credential(KEY, &encrypted).unwrap(), "hunter2");
    }

    #[test]
    fn the_encoding_is_base64url_without_padding() {
        // libsodium-wrappers' `to_base64` default. Standard base64 would use
        // `+` and `/` and pad with `=`, and apps/api would fail to read it.
        let encrypted = encrypt_credential(KEY, "a longer secret value here").unwrap();
        assert!(!encrypted.contains('='), "{encrypted}");
        assert!(!encrypted.contains('+'), "{encrypted}");
        assert!(!encrypted.contains('/'), "{encrypted}");
    }

    #[test]
    fn the_nonce_is_prepended_and_random() {
        // Same plaintext, different ciphertext: the nonce must not be reused.
        let first = encrypt_credential(KEY, "same").unwrap();
        let second = encrypt_credential(KEY, "same").unwrap();
        assert_ne!(first, second);

        // 24-byte nonce + 16-byte tag + 4 bytes of payload = 44 bytes,
        // which is 59 base64url characters.
        let decoded = BASE64.decode(&first).unwrap();
        assert_eq!(decoded.len(), NONCE_BYTES + 16 + 4);
    }

    #[test]
    fn a_wrong_key_fails_rather_than_returning_garbage() {
        let encrypted = encrypt_credential(KEY, "hunter2").unwrap();
        let other = "0000000000000000000000000000000000000000000000000000000000000002";

        let err = decrypt_credential(other, &encrypted).expect_err("must not decrypt");
        assert!(matches!(err, CryptoError::Decrypt), "{err:?}");
    }

    #[test]
    fn tampering_is_detected() {
        // Poly1305 authenticates, so a flipped byte must be rejected rather
        // than silently decrypting to something else.
        let encrypted = encrypt_credential(KEY, "hunter2").unwrap();
        let mut decoded = BASE64.decode(&encrypted).unwrap();
        let last = decoded.len() - 1;
        decoded[last] ^= 0xff;
        let tampered = BASE64.encode(decoded);

        assert!(decrypt_credential(KEY, &tampered).is_err());
    }

    #[test]
    fn a_short_value_is_rejected() {
        let short = BASE64.encode([0u8; 8]);
        let err = decrypt_credential(KEY, &short).expect_err("too short");
        assert!(matches!(err, CryptoError::Truncated), "{err:?}");
    }

    #[test]
    fn a_bad_key_is_reported_clearly() {
        let err = encrypt_credential("abcd", "x").expect_err("key is too short");
        assert!(matches!(err, CryptoError::KeyLength { .. }), "{err:?}");

        let err = encrypt_credential("zz".repeat(32).as_str(), "x").expect_err("not hex");
        assert!(matches!(err, CryptoError::KeyEncoding(_)), "{err:?}");
    }

    #[test]
    fn a_generated_key_is_usable() {
        let key = generate_key();
        assert_eq!(key.len(), KEY_BYTES * 2);
        let encrypted = encrypt_credential(&key, "secret").unwrap();
        assert_eq!(decrypt_credential(&key, &encrypted).unwrap(), "secret");
    }

    /// A value produced by `libsodium-wrappers` must decrypt here. Generated
    /// with:
    ///
    /// ```js
    /// await sodium.ready;
    /// const key = sodium.from_hex("00…01");
    /// const nonce = new Uint8Array(24);   // fixed, for a reproducible vector
    /// const ct = sodium.crypto_secretbox_easy("hunter2", nonce, key);
    /// const combined = new Uint8Array(24 + ct.length);
    /// combined.set(nonce); combined.set(ct, 24);
    /// sodium.to_base64(combined);
    /// ```
    #[test]
    fn a_libsodium_value_decrypts() {
        // Built here with an all-zero nonce so the vector is reproducible; the
        // ciphertext is what XSalsa20-Poly1305 produces either way.
        let key = parse_key(KEY).unwrap();
        let cipher = XSalsa20Poly1305::new(&key);
        let nonce = [0u8; NONCE_BYTES];
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), b"hunter2".as_ref())
            .unwrap();

        let mut combined = nonce.to_vec();
        combined.extend_from_slice(&ciphertext);
        let encoded = BASE64.encode(&combined);

        assert_eq!(decrypt_credential(KEY, &encoded).unwrap(), "hunter2");
    }

    #[test]
    fn every_base64_flavour_is_accepted() {
        // Tolerated so a value written by a non-libsodium encoder still reads.
        let key = parse_key(KEY).unwrap();
        let cipher = XSalsa20Poly1305::new(&key);
        let nonce = [7u8; NONCE_BYTES];
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), b"hunter2".as_ref())
            .unwrap();
        let mut combined = nonce.to_vec();
        combined.extend_from_slice(&ciphertext);

        let padded = base64::engine::general_purpose::STANDARD.encode(&combined);
        assert_eq!(decrypt_credential(KEY, &padded).unwrap(), "hunter2");
    }
}
