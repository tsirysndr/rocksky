mod error;
mod models;
mod refresh;
mod routes;
mod store;

use actix_web::{web, App, HttpServer};
use clap::Parser;
use routes::Refresher;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use store::Store;

#[derive(Parser, Clone, Debug)]
#[command(
    name = "drift",
    about = "Precomputed music recommendations for Rocksky — one DuckDB pass over live Postgres history plus audio features, served from a dedicated DuckDB database file."
)]
pub struct Config {
    #[arg(short = 'p', long, env = "DRIFT_PORT", default_value_t = 8093)]
    pub port: u16,

    #[arg(short = 'H', long, env = "DRIFT_HOST", default_value = "127.0.0.1")]
    pub host: String,

    /// The DuckDB database file recommendations are written to and served from.
    #[arg(long = "db", env = "DRIFT_DB", default_value = "recommendations.ddb")]
    pub db_path: String,

    /// Postgres connection string; falls back to DATABASE_URL.
    #[arg(long, env = "DRIFT_DATABASE_URL")]
    pub database_url: Option<String>,

    /// riff's track_audio_features parquet (Spotify audio features, VARCHAR
    /// columns). Missing file = pipeline runs without the content signal.
    #[arg(
        long,
        env = "DRIFT_FEATURES_PARQUET",
        default_value = "track_audio_features.parquet"
    )]
    pub features_parquet: String,

    #[arg(long, env = "DRIFT_REFRESH_INTERVAL_SECS", default_value_t = 1800)]
    pub refresh_interval_secs: u64,

    /// Rows precomputed per user (serving trims to the request's `limit`).
    #[arg(long, env = "DRIFT_LIMIT_PER_USER", default_value_t = 100)]
    pub limit_per_user: usize,

    #[arg(long, env = "DRIFT_NEIGHBOURS", default_value_t = 50)]
    pub neighbours: usize,

    /// Per-day recency decay; 0.02 ≈ 35-day half-life.
    #[arg(long, env = "DRIFT_DECAY_LAMBDA", default_value_t = 0.02)]
    pub decay_lambda: f64,

    /// Exponent on the audio-feature similarity term (0 disables it).
    #[arg(long, env = "DRIFT_CONTENT_WEIGHT", default_value_t = 0.6)]
    pub content_weight: f64,

    #[arg(long, env = "DRIFT_SERENDIPITY_RATIO", default_value_t = 0.15)]
    pub serendipity_ratio: f64,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    let cfg = Config::parse();

    let db_url = cfg
        .database_url
        .clone()
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .unwrap_or_else(|| {
            eprintln!("error: no Postgres URL — set DRIFT_DATABASE_URL (or DATABASE_URL)");
            std::process::exit(1);
        });

    let store = Arc::new(Store::open(&cfg.db_path).unwrap_or_else(|e| {
        eprintln!("error: {e}");
        std::process::exit(1);
    }));
    if store.is_ready() {
        log::info!(
            "{} already holds a snapshot — serving it while the first refresh runs",
            cfg.db_path
        );
    }
    let refresher = Arc::new(Refresher {
        db_url: db_url.clone(),
        running: Mutex::new(()),
    });

    // First refresh before accepting traffic, so a fresh deploy never answers
    // 503 in the happy path. A failure (e.g. Postgres briefly down) is logged
    // and left to the background loop to retry rather than crashing the
    // service — and if the database file already holds a previous snapshot,
    // it keeps being served in the meantime.
    //
    // On a dedicated thread, not inline: the sync `postgres` client drives its
    // own runtime via block_on, which panics on this thread — actix_web::main
    // is already inside one. (The other call sites are safe: the interval loop
    // is a plain thread and the endpoint goes through web::block.)
    {
        let cfg = cfg.clone();
        let db_url = db_url.clone();
        let store = Arc::clone(&store);
        let outcome = thread::spawn(move || refresh::refresh(&cfg, &db_url, &store))
            .join()
            .unwrap_or_else(|_| Err("initial refresh thread panicked".into()));
        if let Err(e) = outcome {
            log::error!("initial refresh failed (will retry on the interval): {e}");
        }
    }

    {
        let cfg = cfg.clone();
        let store = Arc::clone(&store);
        let refresher = Arc::clone(&refresher);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(cfg.refresh_interval_secs));
            let Ok(_guard) = refresher.running.try_lock() else {
                log::info!("skipping scheduled refresh: one is already running");
                continue;
            };
            if let Err(e) = refresh::refresh(&cfg, &refresher.db_url, &store) {
                log::error!("scheduled refresh failed: {e}");
            }
        });
    }

    log::info!("drift listening on {}:{}", cfg.host, cfg.port);
    let bind = (cfg.host.clone(), cfg.port);
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(Arc::clone(&store)))
            .app_data(web::Data::new(Arc::clone(&refresher)))
            .app_data(web::Data::new(cfg.clone()))
            .service(routes::index)
            .service(routes::health)
            .service(routes::status)
            .service(routes::recommendations)
            .service(routes::trigger_refresh)
    })
    .bind(bind)?
    .run()
    .await
}
