use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AccessToken {
    pub access_token: String,
    pub token_type: String,
    pub scope: String,
    pub expires_in: u32,
}
