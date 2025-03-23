use std::{env, sync::Arc, thread};

use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use sqlx::{Pool, Postgres};
use tokio_stream::StreamExt;

pub const MUSIC_DIR: &str = "Music";

use crate::{
  client::GoogleDriveClient, crypto::decrypt_aes_256_ctr, read_payload, repo::google_drive_token::find_google_drive_refresh_token, scan, types::file::{DownloadFileParams, GetFilesInParentsParams, GetFilesParams, ScanFolderParams}
};

pub async fn create_music_directory(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Pool<Postgres>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetFilesParams>(&body)?;

  let refresh_token = find_google_drive_refresh_token(&pool.clone(), &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap().0,
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = GoogleDriveClient::new(&refresh_token).await?;
  let file = client.create_music_directory().await?;

  Ok(HttpResponse::Ok().json(web::Json(file)))
}

pub async fn get_music_directory(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Pool<Postgres>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetFilesParams>(&body)?;

  let refresh_token = find_google_drive_refresh_token(&pool.clone(), &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap().0,
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = GoogleDriveClient::new(&refresh_token).await?;
  let files = client.get_music_directory().await?;

  Ok(HttpResponse::Ok().json(web::Json(files)))
}

pub async fn get_files_in_parents(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Pool<Postgres>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetFilesInParentsParams>(&body)?;

  let refresh_token = find_google_drive_refresh_token(&pool.clone(), &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap().0,
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = GoogleDriveClient::new(&refresh_token).await?;
  let files = client.get_files_in_parents(&params.parent_id).await?;

  Ok(HttpResponse::Ok().json(web::Json(files)))
}

pub async fn get_file(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Pool<Postgres>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
  let refresh_token = find_google_drive_refresh_token(&pool.clone(), &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap().0,
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = GoogleDriveClient::new(&refresh_token).await?;
  let file = client.get_file(&params.file_id).await?;

  Ok(HttpResponse::Ok().json(web::Json(file)))
}


pub async fn download_file(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Pool<Postgres>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<DownloadFileParams>(&body)?;

  let refresh_token = find_google_drive_refresh_token(&pool.clone(), &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap().0,
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = GoogleDriveClient::new(&refresh_token).await?;
  client.download_file(&params.file_id).await
}

pub async fn scan_folder(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Pool<Postgres>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<ScanFolderParams>(&body)?;

  let pool = pool.clone();
  thread::spawn(move || {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(scan::scan_folder(pool, &params.did, &params.folder_id))?;
    Ok::<(), Error>(())
  });

  // sleep for 2 second to allow the thread to start
  tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

  Ok(HttpResponse::Ok().finish())
}
