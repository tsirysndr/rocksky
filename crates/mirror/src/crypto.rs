//! Decrypts API keys stored by `apps/api/src/lib/storage-crypto.ts`.
//!
//! Layout: base64( nonce (24 bytes) || ciphertext_with_tag )
//! Algorithm: libsodium `crypto_secretbox_easy` (XSalsa20-Poly1305).
//! libsodium-wrappers' `to_base64()` defaults to URL-safe + no padding.

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

fn decode_base64_permissive(s: &str) -> Result<Vec<u8>, Error> {
    for engine in [&URL_SAFE_NO_PAD, &URL_SAFE, &STANDARD_NO_PAD, &STANDARD] {
        if let Ok(b) = engine.decode(s) {
            return Ok(b);
        }
    }
    Err(anyhow!("invalid base64"))
}
