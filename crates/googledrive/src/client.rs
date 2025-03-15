use std::env;

use actix_web::HttpResponse;
use anyhow::Error;
use reqwest::Client;

use crate::types::{file::FileList, token::AccessToken};

pub const BASE_URL: &str = "https://www.googleapis.com/drive/v3";

pub async fn get_access_token(refresh_token: &str) -> Result<AccessToken, Error> {
  let client = Client::new();

  let params = [
    ("grant_type", "refresh_token"),
    ("refresh_token", refresh_token),
    ("client_id", &env::var("GOOGLE_CLIENT_ID")?),
    ("client_secret", &env::var("GOOGLE_CLIENT_SECRET")?),
  ];

  let body = serde_urlencoded::to_string(&params)?;
  let res = client.post("https://oauth2.googleapis.com/token")
    .header("Content-Type", "application/x-www-form-urlencoded")
    .header("Content-Length", body.len())
    .body(body)
    .send()
    .await?;

  Ok(res.json::<AccessToken>().await?)
}

pub struct GoogleDriveClient {
  pub access_token: String,
}

impl GoogleDriveClient {
  pub async fn new(refresh_token: &str) -> Result<Self, Error> {
    let res = get_access_token(refresh_token).await?;
    Ok(Self {
      access_token: res.access_token,
    })
  }

  pub async fn get_files(&self, name: &str) -> Result<FileList, Error> {
    let client = Client::new();
    let url = format!("{}/files", BASE_URL);
    let res = client.get(&url)
      .bearer_auth(&self.access_token)
      .query(&[
        ("q", format!("name='{}' and mimeType='application/vnd.google-apps.folder'", name).as_str()),
        ("fields", "files(id, name, mimeType, parents)"),
        ])
      .send()
      .await?;

    Ok(res.json::<FileList>().await?)
  }

  pub async fn get_files_in_parents(&self, parent_id: &str) -> Result<FileList, Error> {
    let client = Client::new();
    let url = format!("{}/files", BASE_URL);
    let res = client.get(&url)
      .bearer_auth(&self.access_token)
      .query(&[
        ("q", format!("'{}' in parents", parent_id).as_str()),
        ("fields", "files(id, name, mimeType, parents)"),
        ])
      .send()
      .await?;
    Ok(res.json::<FileList>().await?)
  }

  pub async fn download_file(&self, file_id: &str) -> Result<HttpResponse, Error> {
    let client = Client::new();
    let url = format!("{}/files/{}", BASE_URL, file_id);
    let res = client.get(&url)
      .bearer_auth(&self.access_token)
      .query(&[
        ("alt", "media"),
        ])
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
}