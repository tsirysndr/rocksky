use actix_web::{get, post, web, HttpResponse, Responder};
use anyhow::Error;
use scrobble::handle_scrobble;
use sqlx::{Pool, Postgres};
use v1::authenticate::authenticate;
use v1::nowplaying::nowplaying;
use v1::submission::submission;
use std::collections::BTreeMap;
use std::sync::Arc;
use crate::cache::Cache;
use crate::BANNER;

pub mod scrobble;
pub mod v1;


#[get("/")]
pub async fn index(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    params: web::Query<BTreeMap<String, String>>,
) -> impl Responder {
    if params.is_empty() {
        return Ok(HttpResponse::Ok().body(BANNER));
    }

    authenticate(
        params.into_inner(),
        cache.get_ref(),
        data.get_ref(),
    )
    .await
    .map_err(actix_web::error::ErrorInternalServerError)
}

#[post("/nowplaying")]
pub async fn handle_nowplaying(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    nowplaying(
      form.into_inner(),
      cache.get_ref(),
      data.get_ref(),
    )
    .map_err(actix_web::error::ErrorInternalServerError)
}

#[post("/submission")]
pub async fn handle_submission(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    submission(
        form.into_inner(),
        cache.get_ref(),
        data.get_ref(),
    )
    .await
    .map_err(actix_web::error::ErrorInternalServerError)
}

#[get("/2.0")]
pub async fn handle_get() -> impl Responder {
    HttpResponse::Ok().body(BANNER)
}

#[post("/2.0")]
pub async fn handle_methods(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    let conn = data.get_ref();
    let cache = cache.get_ref();

    let method = form.get("method").unwrap_or(&"".to_string()).to_string();
    call_method(&method, conn, cache, form.into_inner()).await
      .map_err(actix_web::error::ErrorInternalServerError)
}

pub async fn call_method(
    method: &str,
    pool: &Arc<Pool<Postgres>>,
    cache: &Cache,
    form: BTreeMap<String, String>) -> Result<HttpResponse, Error> {
  match method {
    "track.scrobble" => handle_scrobble(form, pool, cache).await,
    _ => {
        Err(Error::msg(format!("Unsupported method: {}", method)))
    }
  }
}
