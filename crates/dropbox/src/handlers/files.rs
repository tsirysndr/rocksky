use std::{env, sync::Arc, thread};

use actix_web::{HttpRequest, HttpResponse, web};
use anyhow::Error;
use owo_colors::OwoColorize;
use sqlx::{Pool, Postgres};
use tokio_stream::StreamExt;

use crate::{
    client::DropboxClient,
    crypto::decrypt_aes_256_ctr,
    read_payload,
    repo::dropbox_token::find_dropbox_refresh_token,
    scan,
    types::file::{DownloadFileParams, GetFilesAtParams, GetFilesParams, ScanFolderParams},
};

pub const MUSIC_DIR: &str = "/Music";

pub async fn get_files(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetFilesParams>(&body)?;
    let refresh_token = find_dropbox_refresh_token(&pool.clone(), &params.did).await?;
    tracing::info!(did = %params.did.bright_green(), "dropbox.getFiles");

    if refresh_token.is_none() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let refresh_token = decrypt_aes_256_ctr(
        &refresh_token.unwrap().0,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let client = DropboxClient::new(&refresh_token).await?;
    let entries = client.get_files(MUSIC_DIR).await?;

    Ok(HttpResponse::Ok().json(web::Json(entries)))
}

pub async fn create_music_folder(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetFilesParams>(&body)?;
    let refresh_token = find_dropbox_refresh_token(&pool.clone(), &params.did).await?;
    tracing::info!(did = %params.did.bright_green(), "dropbox.createMusicFolder");

    if refresh_token.is_none() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let refresh_token = decrypt_aes_256_ctr(
        &refresh_token.unwrap().0,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let client = DropboxClient::new(&refresh_token).await?;
    client.create_music_folder().await?;

    Ok(HttpResponse::Ok().finish())
}

pub async fn get_files_at(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetFilesAtParams>(&body)?;
    let refresh_token = find_dropbox_refresh_token(&pool.clone(), &params.did).await?;
    tracing::info!(did = %params.did.bright_green(), path = %params.path.bright_green(), "dropbox.getFilesAt");

    if refresh_token.is_none() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let refresh_token = decrypt_aes_256_ctr(
        &refresh_token.unwrap().0,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let client = DropboxClient::new(&refresh_token).await?;
    let entries = client.get_files(&params.path).await?;

    Ok(HttpResponse::Ok().json(web::Json(entries)))
}

pub async fn download_file(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
    let refresh_token = find_dropbox_refresh_token(&pool.clone(), &params.did).await?;
    tracing::info!(did = %params.did.bright_green(), path = %params.path.bright_green(), "dropbox.downloadFile");

    if refresh_token.is_none() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let refresh_token = decrypt_aes_256_ctr(
        &refresh_token.unwrap().0,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let client = DropboxClient::new(&refresh_token).await?;
    client.download_file(&params.path).await
}

pub async fn get_temporary_link(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
    let refresh_token = find_dropbox_refresh_token(&pool.clone(), &params.did).await?;
    tracing::info!(did = %params.did.bright_green(), path = %params.path.bright_green(), "dropbox.getTemporaryLink");

    if refresh_token.is_none() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let refresh_token = decrypt_aes_256_ctr(
        &refresh_token.unwrap().0,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let client = DropboxClient::new(&refresh_token).await?;
    let temporary_link = client.get_temporary_link(&params.path).await?;

    Ok(HttpResponse::Ok().json(web::Json(temporary_link)))
}

pub async fn get_metadata(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<DownloadFileParams>(&body)?;
    let refresh_token = find_dropbox_refresh_token(&pool.clone(), &params.did).await?;
    tracing::info!(did = %params.did.bright_green(), path = %params.path.bright_green(), "dropbox.getMetadata");

    if refresh_token.is_none() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let refresh_token = decrypt_aes_256_ctr(
        &refresh_token.unwrap().0,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let client = DropboxClient::new(&refresh_token).await?;
    let metadata = client.get_metadata(&params.path).await?;

    Ok(HttpResponse::Ok().json(web::Json(metadata)))
}

pub async fn scan_folder(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    pool: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ScanFolderParams>(&body)?;
    tracing::info!(did = %params.did.bright_green(), path = %params.path.bright_green(), "dropbox.scanFolder");

    let pool = pool.clone();
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(scan::scan_folder(pool, &params.did, &params.path))?;
        Ok::<(), Error>(())
    });

    // sleep for 2 second to allow the thread to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    Ok(HttpResponse::Ok().finish())
}
