use actix_web::{get, HttpResponse, Responder};

use crate::BANNER;


#[get("/")]
pub async fn index() -> impl Responder {
  HttpResponse::Ok().body(BANNER)
}