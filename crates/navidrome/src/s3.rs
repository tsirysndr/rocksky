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
// Node.js stores: base64(nonce[24] || MAC[16] || ciphertext[n])
// libsodium format:  MAC before ciphertext
// RustCrypto format: ciphertext then TAG — so bytes are rearranged before decryption.
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

    let combined = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| Error::msg("Failed to base64-decode credential"))?;

    if combined.len() < 24 + 16 {
        return Err(Error::msg("Encrypted credential too short"));
    }

    let nonce = Nonce::from_slice(&combined[..24]);

    // Rearrange from libsodium format (MAC||CT) to RustCrypto format (CT||TAG)
    let mac = &combined[24..40];
    let ct = &combined[40..];
    let mut rustcrypto_ct = ct.to_vec();
    rustcrypto_ct.extend_from_slice(mac);

    let cipher = XSalsa20Poly1305::new(Key::from_slice(&key_bytes));
    let plaintext = cipher
        .decrypt(nonce, rustcrypto_ct.as_slice())
        .map_err(|_| Error::msg("Credential decryption failed"))?;

    String::from_utf8(plaintext)
        .map_err(|e| Error::msg(format!("Decrypted value is not UTF-8: {e}")))
}
