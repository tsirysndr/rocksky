use std::env;

use actix_web::{get, post, web::{self, Data}, App, HttpRequest, HttpResponse, HttpServer, Responder};
use duckdb::Connection;
use anyhow::Error;
use owo_colors::OwoColorize;
use serde_json::json;
use std::sync::{Arc, Mutex};

use crate::{handlers::handle, subscriber::subscribe};

// return json response
#[get("/")]
async fn index(_req: HttpRequest) -> HttpResponse {
  HttpResponse::Ok().json(json!({
    "server": "Rocksky Analytics Server",
    "version": "0.1.0",
  }))
}

#[post("/{method}")]
async fn call_method(
  data: web::Data<Arc<Mutex<Connection>>>,
  mut payload: web::Payload,
  req: HttpRequest) -> Result<impl Responder, actix_web::Error> {
  let method = req.match_info().get("method").unwrap_or("unknown");
  println!("Method: {}", method.bright_green());

  let conn = data.get_ref().clone();
  handle(method, &mut payload, &req, conn).await
      .map_err(actix_web::error::ErrorInternalServerError)
}


pub async fn serve(conn: Arc<Mutex<Connection>>) -> Result<(), Error> {
  subscribe(conn.clone()).await?;

  let host = env::var("ANALYTICS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
  let port = env::var("ANALYTICS_PORT").unwrap_or_else(|_| "7879".to_string());
  let addr = format!("{}:{}", host, port);

  let url = format!("http://{}", addr);
  println!("Listening on {}", url.bright_green());

  let conn = conn.clone();
  HttpServer::new(move || {
    App::new()
      .app_data(Data::new( conn.clone()))
      .service(index)
      .service(call_method)
  })
  .bind(&addr)?
  .run()
  .await
  .map_err(Error::new)?;

  Ok(())
}
