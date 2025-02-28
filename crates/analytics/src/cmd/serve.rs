use std::env;

use actix_web::{get, App, HttpRequest, HttpServer};
use duckdb::Connection;
use anyhow::Error;
use owo_colors::OwoColorize;

#[get("/")]
async fn index(_req: HttpRequest) -> String {
  "Hello world!".to_owned()
}

pub async fn serve(_conn: &Connection) -> Result<(), Error> {
  let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
  let port = env::var("PORT").unwrap_or_else(|_| "7879".to_string());
  let addr = format!("{}:{}", host, port);

  let url = format!("http://{}", addr);
  println!("Listening on {}", url.bright_green());

  HttpServer::new(|| App::new().service(index))
    .bind(&addr)?
    .run()
    .await
    .map_err(Error::new)?;
  Ok(())
}