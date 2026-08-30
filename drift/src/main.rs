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

    /// DuckDB memory ceiling during refresh. Above it DuckDB spills to disk
    /// instead of growing until the kernel OOM-kills the service.
    #[arg(long, env = "DRIFT_MEMORY_LIMIT", default_value = "2GB")]
    pub memory_limit: String,

    /// Candidates scored per user before ranking (CF and serendipity pools
    /// each). The final list keeps ~limit-per-user rows, so this only trades
    /// candidate breadth against refresh time and memory.
    #[arg(long, env = "DRIFT_CANDIDATE_LIMIT", default_value_t = 500)]
    pub candidate_limit: usize,

    /// Tracks per user the taste profile is built from: the most-played
    /// (recency-decayed) plus loved tracks. Everything downstream —
    /// neighbours, taste vectors, CF — derives from this set.
    #[arg(long, env = "DRIFT_PROFILE_LIMIT", default_value_t = 500)]
    pub profile_limit: usize,

    /// Only scrobbles newer than this many days feed a refresh. At the default
    /// decay a play this old carries weight ~2e-5 — invisible to every score —
    /// so the window bounds the Postgres fetch as history grows, with no
    /// observable change to the output. 0 fetches all history.
    #[arg(long, env = "DRIFT_HISTORY_DAYS", default_value_t = 548)]
    pub history_days: u32,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();
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
        tracing::info!(
            "{} already holds a snapshot — serving it while the first refresh runs",
            cfg.db_path
        );
    }
    let refresher = Arc::new(Refresher {
        db_url: db_url.clone(),
        running: Mutex::new(()),
    });

    // Kick off the first refresh in the background and start serving right
    // away: a refresh takes a minute or two (WAN fetch + pipeline) and must
    // not keep the port closed for that long. Until it lands, requests are
    // answered from the previous snapshot in the database file, or 503 on a
    // truly fresh deploy. The refresher mutex keeps it from overlapping a
    // manual POST /v1/refresh.
    //
    // A dedicated thread, not inline: the fetch phase spins up its own tokio
    // runtime via block_on, which panics on this thread — actix_web::main is
    // already inside one. (The other call sites are safe: the interval loop
    // is a plain thread and the endpoint goes through web::block.)
    {
        let cfg = cfg.clone();
        let db_url = db_url.clone();
        let store = Arc::clone(&store);
        let refresher = Arc::clone(&refresher);
        thread::spawn(move || {
            let Ok(_guard) = refresher.running.try_lock() else {
                return;
            };
            if let Err(e) = refresh::refresh(&cfg, &db_url, &store, false) {
                tracing::error!("initial refresh failed (will retry on the interval): {e}");
            }
        });
    }

    {
        let cfg = cfg.clone();
        let store = Arc::clone(&store);
        let refresher = Arc::clone(&refresher);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(cfg.refresh_interval_secs));
            let Ok(_guard) = refresher.running.try_lock() else {
                tracing::info!("skipping scheduled refresh: one is already running");
                continue;
            };
            if let Err(e) = refresh::refresh(&cfg, &refresher.db_url, &store, false) {
                tracing::error!("scheduled refresh failed: {e}");
            }
        });
    }

    tracing::info!("drift listening on {}:{}", cfg.host, cfg.port);
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
