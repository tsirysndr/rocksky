use std::env;

use actix_web::HttpResponse;
use anyhow::Error;
use reqwest::Client;
use serde_json::json;

use crate::types::{file::{EntryList, TemporaryLink}, token::AccessToken};

pub const BASE_URL: &str = "https://api.dropboxapi.com/2";
pub const CONTENT_URL: &str = "https://content.dropboxapi.com/2";

pub async fn get_access_token(refresh_token: &str) -> Result<AccessToken, Error> {
  let client = Client::new();
  let res = client.post("https://api.dropboxapi.com/oauth2/token")
    .header("Content-Type", "application/x-www-form-urlencoded")
    .query(&[
      ("grant_type", "refresh_token"),
      ("refresh_token", refresh_token),
      ("client_id", &env::var("DROPBOX_CLIENT_ID")?),
      ("client_secret", &env::var("DROPBOX_CLIENT_SECRET")?),
    ])
    .send()
    .await?;

  Ok(res.json::<AccessToken>().await?)
}

pub struct DropboxClient {
  pub access_token: String,
}

impl DropboxClient {
  pub async fn new(refresh_token: &str) -> Result<Self, Error> {
    let res = get_access_token(refresh_token).await?;
    Ok(DropboxClient {
      access_token: res.access_token,
    })
  }

  pub async fn get_files(&self, path: &str) -> Result<EntryList, Error> {
    let client = Client::new();
    let res = client.post(&format!("{}/files/list_folder", BASE_URL))
      .bearer_auth(&self.access_token)
      .json(&json!({
        "path": path,
        "recursive": false,
        "include_media_info": true,
        "include_deleted": false,
        "include_has_explicit_shared_members": false,
        "include_mounted_folders": true,
        "include_non_downloadable_files": true,
      }))
      .send()
      .await?;

    Ok(res.json::<EntryList>().await?)
  }

  pub async fn download_file(&self, path: &str) -> Result<HttpResponse, Error> {
    let client = Client::new();
    let res = client.post(&format!("{}/files/download", CONTENT_URL))
      .bearer_auth(&self.access_token)
      .header("Dropbox-API-Arg", &json!({ "path": path }).to_string())
      .send()
      .await?;

      let mut actix_response = HttpResponse::Ok();

      // Forward headers
      for (key, value) in res.headers().iter() {
          actix_response.append_header((key.as_str(), value.to_str().unwrap_or("")));
      }

      // Forward body
      let body = res.bytes_stream();

      Ok(actix_response.streaming(body))
  }

  pub async fn get_temporary_link(&self, path: &str) -> Result<TemporaryLink, Error> {
    let client = Client::new();
    let res = client.post(&format!("{}/files/get_temporary_link", BASE_URL))
      .bearer_auth(&self.access_token)
      .json(&json!({ "path": path }))
      .send()
      .await?;

    Ok(res.json::<TemporaryLink>().await?)
  }
}
