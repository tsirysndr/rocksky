use std::{env, sync::Arc};

use actix_web::{get, post, web::{self, Data}, App, HttpRequest, HttpResponse, HttpServer, Responder};
use anyhow::Error;
use owo_colors::OwoColorize;
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};

use crate::handlers::handle;


#[get("/")]
async fn index(_req: HttpRequest) -> HttpResponse {
  HttpResponse::Ok().json(json!({
    "server": "Rocksky Dropbox Server",
    "version": "0.1.0",
  }))
}

#[post("/{method}")]
async fn call_method(
  data: web::Data<Arc<Pool<Postgres>>>,
  mut payload: web::Payload,
  req: HttpRequest) -> Result<impl Responder, actix_web::Error> {
  let method = req.match_info().get("method").unwrap_or("unknown");
  println!("Method: {}", method.bright_green());

  let conn = data.get_ref().clone();
  handle(method, &mut payload, &req, conn).await
      .map_err(actix_web::error::ErrorInternalServerError)
}


pub async fn serve() -> Result<(), Error> {
  let host = env::var("GOOGLE_DRIVE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
  let port = env::var("GOOGLE_DRIVE_PORT_PORT").unwrap_or_else(|_| "7881".to_string());
  let addr = format!("{}:{}", host, port);

  let url = format!("http://{}", addr);
  println!("Listening on {}", url.bright_green());

  let pool =  PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
  let conn = Arc::new(pool);

  let conn = conn.clone();
  HttpServer::new(move || {
    App::new()
      .app_data(Data::new(conn.clone()))
      .service(index)
      .service(call_method)
  })
  .bind(&addr)?
  .run()
  .await
  .map_err(Error::new)?;

  Ok(())
}