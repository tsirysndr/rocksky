use std::collections::BTreeMap;
use anyhow::Error;
use sqlx::{Pool, Postgres};
use std::env;
use jsonwebtoken::DecodingKey;
use jsonwebtoken::EncodingKey;
use jsonwebtoken::Header;
use jsonwebtoken::Validation;
use serde::{Deserialize, Serialize};

use crate::cache::Cache;
use crate::repo;
use crate::signature::generate_signature;
use crate::xata::user::User;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub exp: usize,
    pub iat: usize,
    pub did: String,
}

pub async fn authenticate_v1(
    pool: &Pool<Postgres>,
    api_key: &str,
    timestamp: &str,
    password_md5: &str,
) -> Result<(), Error> {
    match repo::user::get_user_by_apikey(pool, api_key).await? {
        Some(user) => {
            let shared_secret = user.shared_secret
                .ok_or_else(|| Error::msg("User does not have a shared secret"))?;
            let hashed_password = md5::compute(format!("{}", shared_secret));
            let hashed_password = format!("{:x}", hashed_password);
            let expected_password = format!("{}{}", hashed_password, timestamp);
            let expected_password = md5::compute(expected_password);
            let expected_password = format!("{:x}", expected_password);
            if expected_password != password_md5 {
                println!("{} != {}", expected_password, password_md5);
                return Err(Error::msg("Invalid password"));
            }
            Ok(())
        },
        None => {
            Err(Error::msg("Invalid API key"))
        }
    }
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

pub async fn generate_session_id(
    pool: &Pool<Postgres>,
    cache: &Cache,
    api_key: &str,
) -> Result<String, Error> {
    match repo::user::get_user_by_apikey(pool,  &api_key).await? {
        Some(user) => {
           let mut bytes = [0u8; 16];
           rand::fill(&mut bytes[..]);

           let session_id = hex::encode(bytes);

           let user = serde_json::to_string(&user)
                .map_err(|_| Error::msg("Failed to serialize user"))?;
           cache.set(&format!("lastfm:{}", session_id), &user)?;
           Ok(session_id)
        },
        None => {
            Err(Error::msg("Invalid API key"))
        }
    }
}

pub fn verify_session_id(
    cache: &Cache,
    session_id: &str,
) -> Result<String, Error> {
    let user = cache.get(&format!("lastfm:{}", session_id))?;
    if user.is_none() {
        return Err(Error::msg("Session ID not found"));
    }
    let user: String = user.unwrap();
    let user: User = serde_json::from_str(&user)
        .map_err(|e| Error::msg(format!("Failed to deserialize user: {}", e)))?;
    Ok(user.xata_id)
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