use std::env;

use aes::{
    Aes256,
    cipher::{KeyIvInit, StreamCipher},
};
use anyhow::Error;
use hex::decode;
use jsonwebtoken::{EncodingKey, Header};
use serde::{Deserialize, Serialize};

type Aes256Ctr = ctr::Ctr64BE<Aes256>;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    exp: usize,
    iat: usize,
    did: String,
}

pub fn decrypt_aes_256_ctr(encrypted_text: &str, key: &[u8]) -> Result<String, Error> {
    let iv = decode(env::var("SPOTIFY_ENCRYPTION_IV")?)?;
    let ciphertext = decode(encrypted_text)?;

    let mut cipher =
        Aes256Ctr::new_from_slices(key, &iv).map_err(|_| Error::msg("Invalid key or IV"))?;
    let mut decrypted_data = ciphertext.clone();
    cipher.apply_keystream(&mut decrypted_data);

    Ok(String::from_utf8(decrypted_data)?)
}

pub fn generate_token(did: &str) -> Result<String, Error> {
    if env::var("JWT_SECRET").is_err() {
        return Err(Error::msg("JWT_SECRET is not set"));
    }

    let claims = Claims {
        exp: chrono::Utc::now().timestamp() as usize + 3600,
        iat: chrono::Utc::now().timestamp() as usize,
        did: did.to_string(),
    };

    jsonwebtoken::encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(env::var("JWT_SECRET")?.as_ref()),
    )
    .map_err(Into::into)
}
