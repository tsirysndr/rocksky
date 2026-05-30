//! JWT bearer used by the xrpc client. Mirrors `crates/spotify/src/token.rs`.

use std::env;

use anyhow::{Context, Error};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    exp: usize,
    iat: usize,
    did: String,
}

pub fn generate(did: &str) -> Result<String, Error> {
    let secret = env::var("JWT_SECRET").context("JWT_SECRET not set")?;
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        exp: now + 3600,
        iat: now,
        did: did.to_string(),
    };
    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )?)
}
