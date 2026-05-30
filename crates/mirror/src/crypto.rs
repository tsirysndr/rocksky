//! Two decryption paths for two different stored-credential families:
//!
//! 1. [`decrypt`] — libsodium `crypto_secretbox_easy` (XSalsa20-Poly1305) used
//!    by `apps/api/src/lib/storage-crypto.ts` for the per-user mirror API
//!    keys. Wire layout: base64( nonce (24 bytes) || ciphertext_with_tag ).
//!    libsodium-wrappers' `to_base64()` defaults to URL-safe + no padding.
//!
//! 2. [`decrypt_aes_256_ctr`] — AES-256-CTR-64BE used by the older `spotify`
//!    crate (`crates/spotify/src/crypto.rs`) for `spotify_apps.spotify_secret`.
//!    Key is hex-encoded `SPOTIFY_ENCRYPTION_KEY`; IV is hex-encoded
//!    `SPOTIFY_ENCRYPTION_IV` env var.

use anyhow::{anyhow, Context, Error};
use base64::{
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD},
    Engine,
};
use dryoc::classic::crypto_secretbox::{crypto_secretbox_open_easy, Key, Nonce};
use std::env;

const NONCE_BYTES: usize = 24;

pub fn decrypt(encoded: &str) -> Result<String, Error> {
    let key_hex = env::var("STORAGE_ENCRYPTION_KEY").context("STORAGE_ENCRYPTION_KEY not set")?;
    let key_bytes = hex::decode(&key_hex).context("STORAGE_ENCRYPTION_KEY must be hex")?;
    if key_bytes.len() != 32 {
        return Err(anyhow!(
            "STORAGE_ENCRYPTION_KEY must decode to 32 bytes, got {}",
            key_bytes.len()
        ));
    }
    let mut key: Key = [0u8; 32];
    key.copy_from_slice(&key_bytes);

    let combined = decode_base64_permissive(encoded)?;
    const TAG_BYTES: usize = 16;
    if combined.len() <= NONCE_BYTES + TAG_BYTES {
        return Err(anyhow!("ciphertext too short ({} bytes)", combined.len()));
    }
    let (nonce_bytes, ct) = combined.split_at(NONCE_BYTES);

    let mut nonce: Nonce = [0u8; 24];
    nonce.copy_from_slice(nonce_bytes);

    let mut plaintext = vec![0u8; ct.len() - TAG_BYTES];
    crypto_secretbox_open_easy(&mut plaintext, ct, &nonce, &key)
        .map_err(|e| anyhow!("secretbox decrypt failed: {e}"))?;
    Ok(String::from_utf8(plaintext)?)
}

/// Decrypts a hex-encoded AES-256-CTR ciphertext using the env-resident
/// `SPOTIFY_ENCRYPTION_KEY` (hex) and `SPOTIFY_ENCRYPTION_IV` (hex). Matches
/// `crates/spotify/src/crypto.rs` so we can reuse the existing `spotify_apps`
/// secrets without a new keyring.
pub fn decrypt_aes_256_ctr(encrypted_hex: &str) -> Result<String, Error> {
    use aes::cipher::{KeyIvInit, StreamCipher};
    type Aes256Ctr = ctr::Ctr64BE<aes::Aes256>;

    let key_hex = env::var("SPOTIFY_ENCRYPTION_KEY").context("SPOTIFY_ENCRYPTION_KEY not set")?;
    let iv_hex = env::var("SPOTIFY_ENCRYPTION_IV").context("SPOTIFY_ENCRYPTION_IV not set")?;
    let key = hex::decode(&key_hex).context("SPOTIFY_ENCRYPTION_KEY must be hex")?;
    let iv = hex::decode(&iv_hex).context("SPOTIFY_ENCRYPTION_IV must be hex")?;
    let mut ciphertext = hex::decode(encrypted_hex).context("ciphertext must be hex")?;

    let mut cipher = Aes256Ctr::new_from_slices(&key, &iv)
        .map_err(|_| anyhow!("invalid AES-256-CTR key or IV"))?;
    cipher.apply_keystream(&mut ciphertext);
    Ok(String::from_utf8(ciphertext)?)
}

fn decode_base64_permissive(s: &str) -> Result<Vec<u8>, Error> {
    for engine in [&URL_SAFE_NO_PAD, &URL_SAFE, &STANDARD_NO_PAD, &STANDARD] {
        if let Ok(b) = engine.decode(s) {
            return Ok(b);
        }
    }
    Err(anyhow!("invalid base64"))
}
