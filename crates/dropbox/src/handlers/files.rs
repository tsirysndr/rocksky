use std::{env, sync::{Arc, Mutex}};

use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use sqlx::{Pool, Postgres};
use tokio_stream::StreamExt;

use crate::{
  client::DropboxClient,
  crypto::decrypt_aes_256_ctr,
  read_payload,
  repo::dropbox_token::find_dropbox_refresh_token,
  types::file::{DownloadFileParams, GetFilesAtParams, GetFilesParams},
};

pub const MUSIC_DIR: &str = "/Music";

pub async fn get_files(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetFilesParams>(&body)?;
  let pool = pool.lock().unwrap();
  // let did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";
  let refresh_token = find_dropbox_refresh_token(&pool, &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap(),
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = DropboxClient::new(&refresh_token).await?;
  let entries = client.get_files(MUSIC_DIR).await?;

  Ok(HttpResponse::Ok().json(web::Json(entries)))
}


pub async fn create_music_folder(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetFilesParams>(&body)?;
  let pool = pool.lock().unwrap();
  let refresh_token = find_dropbox_refresh_token(&pool, &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap(),
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = DropboxClient::new(&refresh_token).await?;
  client.create_music_folder().await?;

  Ok(HttpResponse::Ok().finish())
}

pub async fn get_files_at(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetFilesAtParams>(&body)?;
  let pool = pool.lock().unwrap();
  let refresh_token = find_dropbox_refresh_token(&pool, &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap(),
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = DropboxClient::new(&refresh_token).await?;
  let entries = client.get_files(&params.path).await?;

  Ok(HttpResponse::Ok().json(web::Json(entries)))
}

pub async fn download_file(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
  let pool = pool.lock().unwrap();
  let refresh_token = find_dropbox_refresh_token(&pool, &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap(),
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = DropboxClient::new(&refresh_token).await?;
  client.download_file(&params.path).await
}

pub async fn get_temporary_link(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
  let pool = pool.lock().unwrap();
  let refresh_token = find_dropbox_refresh_token(&pool, &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap(),
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = DropboxClient::new(&refresh_token).await?;
  let temporary_link = client.get_temporary_link(&params.path).await?;

  Ok(HttpResponse::Ok().json(web::Json(temporary_link)))
}


pub async fn get_metadata(payload: &mut web::Payload, _req: &HttpRequest, pool: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
  let pool = pool.lock().unwrap();
  let refresh_token = find_dropbox_refresh_token(&pool, &params.did).await?;

  if refresh_token.is_none() {
    return Ok(HttpResponse::Unauthorized().finish());
  }

  let refresh_token = decrypt_aes_256_ctr(
    &refresh_token.unwrap(),
    &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
  )?;

  let client = DropboxClient::new(&refresh_token).await?;
  let metadata = client.get_metadata(&params.path).await?;

  Ok(HttpResponse::Ok().json(web::Json(metadata)))
}
