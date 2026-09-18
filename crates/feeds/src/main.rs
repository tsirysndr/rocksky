use clap::Parser;
use rocksky_feeds::config::Cli;
use rocksky_feeds::{configure, Config, FeedsState};

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    let config = Config::load(Cli::parse())?;

    // The replica is passed to the pool rather than swapped in per query: this
    // service only reads, so there is nothing that needs the primary.
    // Creates the data directory when the URL is the shared SQLite file — a
    // service may well start before the appview has made it.
    if let Some(parent) = config
        .database_url
        .strip_prefix("sqlite://")
        .and_then(|path| std::path::Path::new(path.split('?').next().unwrap_or(path)).parent())
    {
        let _ = std::fs::create_dir_all(parent);
    }

    let db = rocksky_db::Backend::connect_split(
        &config.database_url,
        config.read_database_url.as_deref(),
    )
    .await?;

    let host = config.host.clone();
    let port = config.port;
    tracing::info!(
        did = %config.own_did(),
        feeds = rocksky_feeds::feeds::FEEDS.len(),
        "serving feeds on {host}:{port}"
    );

    let state = FeedsState::new(db, config);

    actix_web::HttpServer::new(move || {
        actix_web::App::new()
            .app_data(actix_web::web::Data::new(state.clone()))
            // A feed is public data read by other services' browsers, so any
            // origin may read it.
            .wrap(actix_cors::Cors::permissive())
            .configure(configure)
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}
