use std::sync::Arc;

use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use serde_json::json;
use tokio_stream::StreamExt;

use crate::{queue, read_payload, types::*};

pub async fn add_track(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<AddTrackParams>(&body)?;

    let new_queue = queue::add_track(&client, &params.did, &params.track_id).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}

pub async fn add_tracks(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<AddTracksParams>(&body)?;

    let new_queue = queue::add_tracks(&client, &params.did, params.track_ids).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}

pub async fn insert_track_at(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<InsertTrackAtParams>(&body)?;

    let new_queue =
        queue::insert_track_at(&client, &params.did, params.index, &params.track_id).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}

pub async fn remove_track_at(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<RemoveTrackAtParams>(&body)?;

    let new_queue = queue::remove_track_at(&client, &params.did, params.index).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}

pub async fn shuffle_queue(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ShuffleQueueParams>(&body)?;

    let shuffled_queue = queue::shuffle_queue(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(shuffled_queue))))
}

pub async fn get_queue(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetQueueParams>(&body)?;

    let tracks = queue::get_queue(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(tracks)))
}

pub async fn clear_queue(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ClearQueueParams>(&body)?;

    queue::clear_queue(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({}))))
}

pub async fn get_queue_length(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetQueueLengthParams>(&body)?;

    let length = queue::get_queue_length(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({ "length": length }))))
}

pub async fn is_queue_empty(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<IsQueueEmptyParams>(&body)?;

    let is_empty = queue::is_queue_empty(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({ "is_empty": is_empty }))))
}

pub async fn set_current_track(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<SetCurrentTrackParams>(&body)?;

    queue::set_current_track(&client, &params.did, params.index).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({}))))
}

pub async fn get_current_track(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetCurrentTrackParams>(&body)?;

    let current_track = queue::get_current_track(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({ "current_track": current_track }))))
}

pub async fn clear_current_track(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ClearCurrentTrackParams>(&body)?;

    queue::clear_current_track(&client, &params.did).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({}))))
}

pub async fn move_track(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<MoveTrackParams>(&body)?;

    let new_queue = queue::move_track(&client, &params.did, params.from, params.to).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}

pub async fn replace_queue(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ReplaceQueueParams>(&body)?;

    let new_queue = queue::replace_queue(&client, &params.did, params.track_ids).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}

pub async fn get_track_at(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTrackAtParams>(&body)?;

    let track_id = queue::get_track_at(&client, &params.did, params.index).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!({ "track_id": track_id }))))
}

pub async fn insert_tracks_at(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    client: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<InsertTracksAtParams>(&body)?;

    let new_queue =
        queue::insert_tracks_at(&client, &params.did, params.index, params.track_ids).await?;

    Ok(HttpResponse::Ok().json(web::Json(json!(new_queue))))
}
