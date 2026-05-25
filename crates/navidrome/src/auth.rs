use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::repo::user::get_user_with_apikeys;
use crate::xata::user::UserWithApiKey;

pub async fn authenticate(
    pool: &Pool<Postgres>,
    username: &str,
    password: Option<&str>,
    token: Option<&str>,
    salt: Option<&str>,
) -> Result<UserWithApiKey, Error> {
    let users = get_user_with_apikeys(pool, username).await?;

    if users.is_empty() {
        return Err(Error::msg("User not found"));
    }

    for user in &users {
        let api_key = &user.api_key;

        if let Some(p) = password {
            let plain = if let Some(hex_pass) = p.strip_prefix("enc:") {
                let bytes = hex::decode(hex_pass)
                    .map_err(|_| Error::msg("Invalid hex-encoded password"))?;
                String::from_utf8(bytes).map_err(|_| Error::msg("Invalid UTF-8 in password"))?
            } else {
                p.to_string()
            };

            if plain == *api_key {
                return Ok(user.clone());
            }
        } else if let (Some(t), Some(s)) = (token, salt) {
            let expected = format!("{:x}", md5::compute(format!("{}{}", api_key, s)));
            if expected == t {
                return Ok(user.clone());
            }
        }
    }

    Err(Error::msg("Wrong username or password"))
}
