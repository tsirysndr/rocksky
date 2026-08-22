use actix_web::{middleware, web, App, HttpServer};
use clap::Parser;
use riff::{db, ratelimit, routes, DEFAULT_PORT};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "riff",
    version,
    about = "A read-only Spotify Web API served from Parquet via DuckDB",
    long_about = "riff answers Spotify Web API catalog requests — search, artists, albums, \
                  tracks and audio features — out of the Rocksky Parquet dump, with no \
                  Spotify credentials and no network egress.\n\n\
                  Point a client at it with SPOTIFY_API_URL=http://localhost:8092/v1"
)]
struct Cli {
    /// Port to listen on.
    #[arg(short, long, env = "RIFF_PORT", default_value_t = DEFAULT_PORT)]
    port: u16,

    /// Address to bind.
    #[arg(short = 'H', long, env = "RIFF_HOST", default_value = "127.0.0.1")]
    host: String,

    /// Directory holding the catalog parquet files.
    #[arg(short, long, env = "RIFF_DATA_DIR", default_value = "testdata")]
    data_dir: PathBuf,

    /// Persistent DuckDB file to attach instead of an in-memory database.
    ///
    /// Only worth setting once you have materialized the hot relations into it —
    /// an indexed table beats rescanning a 255M-row parquet on every lookup.
    #[arg(long, env = "RIFF_DB_PATH")]
    db_path: Option<PathBuf>,

    /// Number of DuckDB connections. Each concurrent request holds one — DuckDB
    /// runs them in parallel; a single handle just cannot be shared between
    /// threads.
    #[arg(long, env = "RIFF_POOL_SIZE")]
    pool_size: Option<u32>,

    /// Seconds a request may wait for a pooled DuckDB connection before riff
    /// answers 500. Short on purpose: when the pool is exhausted riff is
    /// overloaded, and shedding immediately lets the proxy fall back to
    /// Spotify instead of queueing every caller into a timeout.
    #[arg(long, env = "RIFF_POOL_TIMEOUT", default_value_t = 5)]
    pool_timeout: u64,

    /// Sustained requests per second allowed per remote IP. Loopback is never
    /// rate limited, whatever this is set to.
    #[arg(long, env = "RIFF_RATE_LIMIT_RPS", default_value_t = 50.0)]
    rate_limit_rps: f64,

    /// How many requests a remote IP may make at once before the sustained rate
    /// applies.
    #[arg(long, env = "RIFF_RATE_LIMIT_BURST", default_value_t = 200.0)]
    rate_limit_burst: f64,

    /// Take the client IP from `X-Forwarded-For`. Enable only behind a proxy you
    /// control — otherwise callers can forge the header to get a fresh bucket.
    #[arg(long, env = "RIFF_TRUST_PROXY", default_value_t = false)]
    trust_proxy: bool,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let cli = Cli::parse();

    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info,actix_server=warn"),
    )
    .init();

    let pool_size = cli.pool_size.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(4)
            .max(4)
    });

    let settings = db::Settings {
        data_dir: cli.data_dir.clone(),
        db_path: cli.db_path.clone(),
        pool_size,
        pool_timeout: std::time::Duration::from_secs(cli.pool_timeout),
    };

    let (catalog, report) = db::open(&settings).map_err(|e| {
        // A missing file or a schema drift is a configuration problem, not a
        // panic: name what is wrong and stop.
        eprintln!("riff: {e}");
        std::io::Error::new(std::io::ErrorKind::InvalidInput, e)
    })?;

    riff::set_listen_port(cli.port);

    log::info!("catalog from {}", cli.data_dir.display());
    for line in &report {
        log::info!("{line}");
    }
    log::info!(
        "riff v{} listening on http://{}:{} ({} DuckDB connections, {} rps/{} burst per remote IP, loopback unlimited)",
        env!("CARGO_PKG_VERSION"),
        cli.host,
        cli.port,
        pool_size,
        cli.rate_limit_rps,
        cli.rate_limit_burst,
    );

    let limiter = ratelimit::RateLimit::new(ratelimit::Config {
        rps: cli.rate_limit_rps,
        burst: cli.rate_limit_burst,
        trust_proxy: cli.trust_proxy,
    });
    let catalog = web::Data::new(catalog);

    HttpServer::new(move || {
        App::new()
            .app_data(catalog.clone())
            .wrap(middleware::Logger::default())
            .wrap(middleware::Compress::default())
            .wrap(limiter.clone())
            .configure(routes::configure)
    })
    .bind((cli.host.as_str(), cli.port))?
    .run()
    .await
}
