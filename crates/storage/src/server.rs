use std::env;

use actix_web::{get, post, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use owo_colors::OwoColorize;
use serde_json::json;
use anyhow::Error;

use crate::handlers::handle;


#[get("/")]
async fn index(_req: HttpRequest) -> HttpResponse {
  HttpResponse::Ok().json(json!({
    "server": "Rocksky Storage Server",
    "version": "0.1.0",
  }))
}

#[post("/{method}")]
async fn call_method(
  mut payload: web::Payload,
  req: HttpRequest) -> Result<impl Responder, actix_web::Error> {
  let method = req.match_info().get("method").unwrap_or("unknown");
  println!("Method: {}", method.bright_green());

  handle(method, &mut payload, &req).await
      .map_err(actix_web::error::ErrorInternalServerError)
}


pub async fn serve() -> Result<(), Error> {

  let host = env::var("STORAGE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
  let port = env::var("STORAGE_PORT").unwrap_or_else(|_| "7883".to_string());
  let addr = format!("{}:{}", host, port);

  let url = format!("http://{}", addr);
  println!("Listening on {}", url.bright_green());

  HttpServer::new(move || {
    App::new()
      .service(index)
      .service(call_method)
  })
  .bind(&addr)?
  .run()
  .await
  .map_err(Error::new)?;

  Ok(())
}