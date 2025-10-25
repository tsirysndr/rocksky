use std::env;

use aes::{
    cipher::{KeyIvInit, StreamCipher},
    Aes256,
};
use anyhow::Error;
use hex::decode;

type Aes256Ctr = ctr::Ctr64BE<Aes256>;

pub fn decrypt_aes_256_ctr(encrypted_text: &str, key: &[u8]) -> Result<String, Error> {
    let iv = decode(env::var("SPOTIFY_ENCRYPTION_IV")?)?;
    let ciphertext = decode(encrypted_text)?;

    let mut cipher =
        Aes256Ctr::new_from_slices(key, &iv).map_err(|_| Error::msg("Invalid key or IV"))?;
    let mut decrypted_data = ciphertext.clone();
    cipher.apply_keystream(&mut decrypted_data);

    Ok(String::from_utf8(decrypted_data)?)
}
