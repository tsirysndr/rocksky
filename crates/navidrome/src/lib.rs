pub mod api;
pub mod auth;
pub mod handlers;
pub mod repo;
pub mod response;
pub mod s3;
pub mod typesense;
pub mod xata;

use std::{env, sync::Arc, time::Duration};

use actix_cors::Cors;
use actix_web::{get, web::Data, App, HttpResponse, HttpServer};
use anyhow::Error;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

pub const BANNER: &str = r#"
    _   __             _     __
   / | / /___ __   __ (_)___/ /________  ____ ___  ___
  /  |/ / __ `/ | / // // __  // ___/ / / / __ `/ / _ \
 / /|  / /_/ /| |/ // // /_/ // /  / /_/ / /_/ / /  __/
/_/ |_/\__,_/ |___// / \__,_//_/   \____/\____/  \___/
                  /___/

 Rocksky Navidrome-compatible API (Subsonic REST API v1.16.1)
"#;

pub const INFO: &str = r#"
  Subsonic REST API v1.16.1
  Auth : handle as username, API key as password
  Docs : https://www.subsonic.org/pages/api.jsp
  Base : /rest/{method}[.view]?u=<handle>&p=<apikey>&v=1.16.1&c=<client>&f=json

  Endpoints
  ─────────────────────────────────────────────
  ping              getLicense
  getMusicFolders   getScanStatus
  getUser           getArtists
  getIndexes        getArtist
  getAlbum          getSong
  stream            getCoverArt
  search3           scrobble
  updateNowPlaying  getAlbumList2
  getRandomSongs    getGenres
  getSongsByGenre   getStarred2
  getArtistInfo2    getAlbumInfo2
  getNowPlaying     getMusicDirectory
  getPlaylists      getPlaylist
  getSimilarSongs2  getTopSongs
  getLyrics         getInternetRadioStations
  getPlayQueue      savePlayQueue
  star              unstar
"#;

#[get("/")]
async fn index() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body(format!("{}{}", BANNER, INFO))
}

pub async fn run() -> Result<(), Error> {
    println!("{}", BANNER.cyan());

    let pool = PgPoolOptions::new()
        .max_connections(25)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let conn = Arc::new(pool);

    repo::playqueue::ensure_table(&conn).await?;

    let ts = Arc::new(typesense::TypesenseClient::from_env());
    if ts.is_some() {
        tracing::info!("Typesense search enabled");
    } else {
        tracing::warn!("TYPESENSE_API_KEY not set — falling back to PostgreSQL LIKE search");
    }

    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = async_nats::connect(&nats_url).await?;
    let nc = Arc::new(nc);
    tracing::info!(url = %nats_url, "Connected to NATS");

    let host = env::var("NAVIDROME_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("NAVIDROME_PORT")
        .unwrap_or_else(|_| "4533".to_string())
        .parse::<u16>()
        .unwrap_or(4533);

    tracing::info!(
        url = %format!("http://{}:{}", host, port).bright_green(),
        "Starting Navidrome-compatible API @"
    );

    HttpServer::new(move || {
        let cors = Cors::permissive();
        App::new()
            .wrap(cors)
            .app_data(Data::new(conn.clone()))
            .app_data(Data::new(ts.clone()))
            .app_data(Data::new(nc.clone()))
            .service(index)
            .service(handlers::handle_get)
            .service(handlers::handle_post)
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}
