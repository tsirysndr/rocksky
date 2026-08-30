use anyhow::Error;
use s3::{creds::Credentials, region::Region, Bucket};
use std::env;

pub fn public_url(r2_key: &str) -> String {
    let base =
        env::var("S3_PUBLIC_URL").unwrap_or_else(|_| "https://files.rocksky.app".to_string());
    let key = r2_key.trim_start_matches('/');
    format!("{}/{}", base.trim_end_matches('/'), key)
}

pub async fn presign_get(r2_key: &str, expires_secs: u32) -> Result<String, Error> {
    let region = Region::Custom {
        region: env::var("S3_REGION").unwrap_or_else(|_| "auto".to_string()),
        endpoint: env::var("S3_ENDPOINT").map_err(|_| Error::msg("S3_ENDPOINT is not set"))?,
    };

    let credentials = Credentials::new(
        Some(&env::var("S3_ACCESS_KEY_ID").map_err(|_| Error::msg("S3_ACCESS_KEY_ID is not set"))?),
        Some(
            &env::var("S3_SECRET_ACCESS_KEY")
                .map_err(|_| Error::msg("S3_SECRET_ACCESS_KEY is not set"))?,
        ),
        None,
        None,
        None,
    )?;

    let bucket_name = env::var("S3_BUCKET").unwrap_or_else(|_| "rocksky-library".to_string());

    let bucket = Bucket::new(&bucket_name, region, credentials)?.with_path_style();

    let key = if r2_key.starts_with('/') {
        r2_key.to_string()
    } else {
        format!("/{}", r2_key)
    };

    let url = bucket.presign_get(&key, expires_secs, None).await?;
    Ok(url)
}

pub async fn presign_get_with_creds(
    r2_key: &str,
    endpoint: &str,
    region: &str,
    bucket_name: &str,
    access_key_id: &str,
    secret_access_key: &str,
    expires_secs: u32,
) -> Result<String, Error> {
    let region = Region::Custom {
        region: region.to_string(),
        endpoint: endpoint.to_string(),
    };

    let credentials = Credentials::new(
        Some(access_key_id),
        Some(secret_access_key),
        None,
        None,
        None,
    )?;

    let bucket = Bucket::new(bucket_name, region, credentials)?.with_path_style();

    let key = if r2_key.starts_with('/') {
        r2_key.to_string()
    } else {
        format!("/{}", r2_key)
    };

    let url = bucket.presign_get(&key, expires_secs, None).await?;
    Ok(url)
}

// Decrypts a credential encrypted by the Node.js libsodium-wrappers secretbox.
//
// Node.js stores: base64(nonce[24] || MAC[16] || ciphertext[n]), and the
// xsalsa20poly1305 crate expects exactly that MAC-first layout too — its
// encrypt "prepends" the tag, same as libsodium. An earlier version of this
// function rearranged the bytes to a supposed tag-last "RustCrypto format",
// which scrambled every valid credential.
//
// The base64 variant matters: libsodium's `to_base64` defaults to URL-safe
// *without* padding, so every credential the API stores uses `-`/`_` and no
// `=`. Decoding with the standard alphabet rejected all of them, which is how
// BYO uploads worked while BYO streaming failed with "Failed to resolve audio
// URL" — upload and playback sat on opposite sides of this mismatch.
pub fn decrypt_credential(encoded: &str, key_hex: &str) -> Result<String, Error> {
    use base64::{engine::general_purpose, Engine as _};
    use xsalsa20poly1305::{
        aead::{Aead, KeyInit},
        Key, Nonce, XSalsa20Poly1305,
    };

    let key_bytes =
        hex::decode(key_hex).map_err(|_| Error::msg("Invalid STORAGE_ENCRYPTION_KEY hex"))?;
    if key_bytes.len() != 32 {
        return Err(Error::msg(
            "STORAGE_ENCRYPTION_KEY must be 32 bytes (64 hex chars)",
        ));
    }

    // URL-safe unpadded first (what the API writes); standard kept as a
    // fallback so a value from any other tooling still decodes.
    let combined = general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .or_else(|_| general_purpose::STANDARD.decode(encoded))
        .map_err(|_| Error::msg("Failed to base64-decode credential"))?;

    if combined.len() < 24 + 16 {
        return Err(Error::msg("Encrypted credential too short"));
    }

    let nonce = Nonce::from_slice(&combined[..24]);

    let cipher = XSalsa20Poly1305::new(Key::from_slice(&key_bytes));
    let plaintext = cipher
        .decrypt(nonce, &combined[24..])
        .map_err(|_| Error::msg("Credential decryption failed"))?;

    String::from_utf8(plaintext)
        .map_err(|e| Error::msg(format!("Decrypted value is not UTF-8: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Produced by the API's own encryptCredential (libsodium-wrappers) with
    /// key 000102…1e1f and a fixed all-zero-counting nonce. Pinned so the two
    /// implementations cannot drift apart again: libsodium's to_base64 is
    /// URL-safe unpadded by default, and decoding with the standard alphabet
    /// rejected every credential the API had ever stored.
    const NODE_VECTOR: &str =
        "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXNRpm4w7WtX4FEag-4c5M2y3MWz2ivo973kWgSQH7IrwxzSet_w";
    const KEY: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    #[test]
    fn decrypts_what_the_node_api_encrypts() {
        assert_eq!(
            decrypt_credential(NODE_VECTOR, KEY).unwrap(),
            "s3cret-key/with+chars"
        );
    }

    /// The same bytes in standard padded base64 must still decode — the
    /// fallback for anything not written by libsodium.
    #[test]
    fn accepts_standard_base64_too() {
        let std_form =
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXNRpm4w7WtX4FEag+4c5M2y3MWz2ivo973kWgSQH7IrwxzSet/w==";
        assert_eq!(
            decrypt_credential(std_form, KEY).unwrap(),
            "s3cret-key/with+chars"
        );
    }

    #[test]
    fn rejects_a_wrong_key() {
        let wrong = "f".repeat(64);
        assert!(decrypt_credential(NODE_VECTOR, &wrong).is_err());
    }
}
