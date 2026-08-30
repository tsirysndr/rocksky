use actix_web::{middleware, web, App, HttpServer};
use clap::Parser;
use riff::{mb, ratelimit};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "riff-mb",
    version,
    about = "A read-only MusicBrainz ws/2 API served from the JSON dumps via DuckDB",
    long_about = "riff-mb answers MusicBrainz ws/2 requests — lookups, searches and \
                  artist browses over areas, artists, events, instruments, labels, \
                  places, recordings, release groups and works — out of one DuckDB \
                  file built by riff-mb-import, with no rate limit and no egress.\n\n\
                  Point a client at it with MUSICBRAINZ_API_URL=http://localhost:8094/ws/2"
)]
struct Cli {
    /// Port to listen on.
    #[arg(short, long, env = "RIFF_MB_PORT", default_value_t = mb::DEFAULT_PORT)]
    port: u16,

    /// Address to bind.
    #[arg(short = 'H', long, env = "RIFF_MB_HOST", default_value = "127.0.0.1")]
    host: String,

    /// DuckDB file written by riff-mb-import.
    #[arg(short, long, env = "RIFF_MB_DB_PATH", default_value = "musicbrainz.duckdb")]
    db_path: PathBuf,

    /// Number of DuckDB connections. Each concurrent request holds one.
    #[arg(long, env = "RIFF_MB_POOL_SIZE")]
    pool_size: Option<u32>,

    /// Seconds a request may wait for a pooled DuckDB connection before riff-mb
    /// answers 500.
    #[arg(long, env = "RIFF_MB_POOL_TIMEOUT", default_value_t = 5)]
    pool_timeout: u64,

    /// Sustained requests per second allowed per remote IP. Loopback is never
    /// rate limited.
    #[arg(long, env = "RIFF_MB_RATE_LIMIT_RPS", default_value_t = 50.0)]
    rate_limit_rps: f64,

    /// How many requests a remote IP may make at once before the sustained rate
    /// applies.
    #[arg(long, env = "RIFF_MB_RATE_LIMIT_BURST", default_value_t = 200.0)]
    rate_limit_burst: f64,

    /// Take the client IP from `X-Forwarded-For`. Enable only behind a proxy
    /// you control.
    #[arg(long, env = "RIFF_MB_TRUST_PROXY", default_value_t = false)]
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

    let settings = mb::db::Settings {
        db_path: cli.db_path.clone(),
        pool_size,
        pool_timeout: std::time::Duration::from_secs(cli.pool_timeout),
        writable: false,
    };

    let (catalog, report) = mb::db::open(&settings).map_err(|e| {
        eprintln!("riff-mb: {e}");
        std::io::Error::new(std::io::ErrorKind::InvalidInput, e)
    })?;

    riff::set_listen_port(cli.port);

    log::info!("musicbrainz catalog from {}", cli.db_path.display());
    for line in &report {
        log::info!("{line}");
    }
    log::info!(
        "riff-mb v{} listening on http://{}:{} ({} DuckDB connections, {} rps/{} burst per remote IP, loopback unlimited)",
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
            .configure(mb::routes::configure)
    })
    .bind((cli.host.as_str(), cli.port))?
    .run()
    .await
}
