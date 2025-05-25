use std::env;

use actix_web::{
    get, post,
    web::{self, Data},
    App, HttpRequest, HttpResponse, HttpServer, Responder,
};
use anyhow::Error;
use owo_colors::OwoColorize;
use s3::{creds::Credentials, Bucket, Region};
use serde_json::json;

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
    data: web::Data<Box<Bucket>>,
    mut payload: web::Payload,
    req: HttpRequest,
) -> Result<impl Responder, actix_web::Error> {
    let method = req.match_info().get("method").unwrap_or("unknown");
    println!("Method: {}", method.bright_green());

    let bucket = data.get_ref().clone();
    handle(method, &mut payload, &req, bucket)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)
}

pub async fn serve() -> Result<(), Error> {
    let host = env::var("STORAGE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("STORAGE_PORT").unwrap_or_else(|_| "7883".to_string());
    let addr = format!("{}:{}", host, port);

    let url = format!("http://{}", addr);
    println!("Listening on {}", url.bright_green());

    let access_key = std::env::var("ACCESS_KEY").expect("ACCESS_KEY not set");
    let secret_key = std::env::var("SECRET_KEY").expect("SECRET_KEY not set");
    let bucket_name = std::env::var("BUCKET_NAME").expect("BUCKET_NAME not set");
    let account_id = std::env::var("ACCOUNT_ID").expect("ACCOUNT_ID not set");

    let bucket = Bucket::new(
        &bucket_name,
        Region::R2 { account_id },
        Credentials::new(
            Some(access_key.as_str()),
            Some(secret_key.as_str()),
            None,
            None,
            None,
        )?,
    )?
    .with_path_style();

    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(bucket.clone()))
            .service(index)
            .service(call_method)
    })
    .bind(&addr)?
    .run()
    .await
    .map_err(Error::new)?;

    Ok(())
}
