use std::collections::BTreeMap;
use anyhow::Error;
use sqlx::{Pool, Postgres};
use std::env;
use jsonwebtoken::DecodingKey;
use jsonwebtoken::EncodingKey;
use jsonwebtoken::Header;
use jsonwebtoken::Validation;
use serde::{Deserialize, Serialize};

use crate::repo;
use crate::signature::generate_signature;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    exp: usize,
    iat: usize,
    did: String,
}

pub async fn authenticate(
  pool: &Pool<Postgres>,
  api_key: &str,
  api_sig: &str,
  session_key: &str,
  form: &BTreeMap<String, String>,
) -> Result<(), Error> {
    let claims = decode_token(session_key)?;

    let user_apikey = repo::api_key::get_apikey(pool, api_key, &claims.did).await?;

    if user_apikey.is_none() {
        return Err(Error::msg("Invalid API key"));
    }

    let user_apikey = user_apikey.unwrap();

    let signature = generate_signature(form, &user_apikey.shared_secret);

    if signature != api_sig {
        return Err(Error::msg("Invalid signature"));
    }

    Ok(())
}

pub async fn extract_did(pool: &Pool<Postgres>, form: &BTreeMap<String, String>) -> Result<String, Error> {
    let apikey = form.get("api_key").ok_or_else(|| Error::msg("Missing api_key"))?;
    let user = repo::user::get_user_by_apikey(pool, apikey).await?;
    let did = user.ok_or_else(|| Error::msg("Corresponding user not found"))?.did;
    Ok(did)
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