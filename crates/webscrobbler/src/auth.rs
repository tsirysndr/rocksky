use anyhow::Error;
use jsonwebtoken::DecodingKey;
use jsonwebtoken::EncodingKey;
use jsonwebtoken::Header;
use jsonwebtoken::Validation;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    exp: usize,
    iat: usize,
    did: String,
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

pub fn decode_token(token: &str) -> Result<Claims, Error> {
    if env::var("JWT_SECRET").is_err() {
        return Err(Error::msg("JWT_SECRET is not set"));
    }

    jsonwebtoken::decode::<Claims>(
        token,
        &DecodingKey::from_secret(env::var("JWT_SECRET")?.as_ref()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use dotenv::dotenv;

    use super::*;

    #[test]
    fn test_generate_token() {
        dotenv().ok();
        let token = generate_token("did:plc:7vdlgi2bflelz7mmuxoqjfcr").unwrap();
        let claims = decode_token(&token).unwrap();

        assert_eq!(claims.did, "did:plc:7vdlgi2bflelz7mmuxoqjfcr");
    }
}
