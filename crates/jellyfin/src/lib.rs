//! A Jellyfin-compatible API over a Rocksky user's uploaded music.
//!
//! Sibling to the Subsonic service in `crates/navidrome`: same library, same
//! credentials, a different protocol. The whole data layer — the Postgres
//! projections over `user_uploads` and the catalogue, S3/BYO URL resolution,
//! Typesense search, and the ATProto side effects — is shared with that crate
//! rather than reimplemented, so a fix to the SQL lands in both surfaces at
//! once and the two can't drift.

pub mod auth;
pub mod compat;
pub mod convert;
pub mod dto;
pub mod guid;
pub mod handlers;
pub mod library;
pub mod query;
pub mod state;
pub mod userdata;

use std::{env, sync::Arc, time::Duration};

use actix_cors::Cors;
use actix_web::{middleware::from_fn, web, App, HttpServer};
use anyhow::Error;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

use rocksky_navidrome::typesense::TypesenseClient;

pub const BANNER: &str = r#"
    __     ____        _____
   / /__  / / /_  ____/ __(_)___
  / // -_) / / // /  _/ _// / _ \
 / //\__/_/_/\_, /_/ /_/ /_/_//_/
/_/         /___/

 Rocksky Jellyfin-compatible API
"#;

pub const INFO: &str = r#"
  Jellyfin API (10.11)
  Auth : handle as username, API key as password
  Docs : https://api.jellyfin.org
  Login: POST /Users/AuthenticateByName {"Username":"<handle>","Pw":"<apikey>"}

  Surfaces
  ─────────────────────────────────────────────
  System/Info       Users/AuthenticateByName
  Users/{id}/Views  Library/MediaFolders
  Items             Items/Latest
  Items/Suggestions Items/Counts
  Items/Filters2    Items/Prefixes
  Artists           Genres / MusicGenres
  Years             Search/Hints
  Audio/{id}/stream Items/{id}/PlaybackInfo
  Items/{id}/Images UserFavoriteItems
  UserItems/UserData UserPlayedItems
  Playlists         Sessions/Playing
"#;

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

    auth::ensure_tables(&pool).await?;
    guid::ensure_table(&pool).await?;
    userdata::ensure_table(&pool).await?;

    let server_id = state::ensure_server_id(&pool).await?;
    let conn = Arc::new(pool);

    let ts = Arc::new(TypesenseClient::from_env());
    if ts.is_some() {
        tracing::info!("Typesense search enabled");
    } else {
        tracing::warn!("TYPESENSE_API_KEY not set — falling back to PostgreSQL LIKE search");
    }

    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = Arc::new(async_nats::connect(&nats_url).await?);
    tracing::info!(url = %nats_url, "Connected to NATS");

    let host = env::var("JELLYFIN_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("JELLYFIN_PORT")
        .unwrap_or_else(|_| "8096".to_string())
        .parse::<u16>()
        .unwrap_or(8096);
    let server_name = env::var("JELLYFIN_SERVER_NAME").unwrap_or_else(|_| "Rocksky".to_string());

    tracing::info!(
        url = %format!("http://{}:{}", host, port).bright_green(),
        server_id = %server_id,
        "Starting Jellyfin-compatible API @"
    );

    let state = web::Data::new(state::AppState {
        pool: conn,
        nc: Some(nc),
        typesense: ts,
        server_id,
        server_name,
        host: host.clone(),
        port,
    });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Cors::permissive())
            // Registered last so it runs first: the router only ever sees a
            // canonical path, which is what makes matching case-insensitive.
            .wrap(from_fn(compat::normalize_path))
            .configure(handlers::configure)
            .default_service(web::to(handlers::log_unrouted))
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}
