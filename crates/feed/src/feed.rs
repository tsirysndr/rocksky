use crate::config::Config;
use crate::feed_handler::FeedHandler;
use crate::repo::duckdb::DuckdbRepo;
use crate::repo::{Repo, RepoImpl};
use crate::subscriber::ScrobbleSubscriber;
use crate::sync::sync_scrobbles;
use crate::types::{DidDocument, FeedSkeleton, Request, Service, SkeletonFeedScrobbleData};
use anyhow::Error;
use atrium_api::app::bsky::feed::get_feed_skeleton::Parameters as FeedSkeletonQuery;
use atrium_api::app::bsky::feed::get_feed_skeleton::ParametersData as FeedSkeletonParameters;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Pool, Postgres};
use std::env;
use std::fmt::Debug;
use std::net::SocketAddr;
use std::sync::Arc;
use warp::Filter;

/// A `Feed` stores a `FeedHandler`, handles feed server endpoints & connects to the Firehose using the `start` methods.
pub trait Feed<Handler: FeedHandler + Clone + Send + Sync + 'static> {
    fn handler(&mut self) -> Handler;
    /// Starts the feed generator server & connects to the firehose.
    ///
    ///
    /// - name: The identifying name of your feed. This value is used in the feed URL & when identifying which feed to *unpublish*. This is a separate value from the display name.
    /// - address: The address to bind the server to
    ///
    /// # Panics
    ///
    /// Panics if unable to bind to the provided address.
    fn start(
        &mut self,
        name: impl AsRef<str>,
        address: impl Into<SocketAddr> + Debug + Clone + Send,
        enable_sync: bool,
    ) -> impl std::future::Future<Output = Result<(), Error>> + Send {
        self.start_with_config(name, Config::load_env_config(), address, enable_sync)
    }

    /// Starts the feed generator server & connects to the firehose.
    ///
    /// - name: The identifying name of your feed. This value is used in the feed URL & when identifying which feed to *unpublish*. This is a separate value from the display name.
    /// - config: Configuration values, see `Config`
    /// - address: The address to bind the server to
    ///
    /// # Panics
    ///
    /// Panics if unable to bind to the provided address.
    fn start_with_config(
        &mut self,
        name: impl AsRef<str>,
        config: Config,
        address: impl Into<SocketAddr> + Debug + Clone + Send,
        enable_sync: bool,
    ) -> impl std::future::Future<Output = Result<(), Error>> + Send {
        let handler = self.handler();
        let address = address.clone();
        let feed_name = name.as_ref().to_string();

        async move {
            let config = config;
            let pool = PgPoolOptions::new()
                .max_connections(5)
                .connect(&env::var("XATA_POSTGRES_URL")?)
                .await?;
            let pool = Arc::new(pool);
            let db_filter = warp::any().map(move || pool.clone());

            let did_config = config.clone();
            let did_json = warp::path(".well-known")
                .and(warp::path("did.json"))
                .and(warp::get())
                .and_then(move || did_json(did_config.clone()));

            let describe_feed_generator = warp::path("xrpc")
                .and(warp::path("app.rocksky.feed.describeFeedGenerator"))
                .and(warp::get())
                .and(db_filter.clone())
                .and_then(move |_pool: Arc<Pool<Postgres>>| {
                    describe_feed_generator(feed_name.clone())
                });

            let get_feed_handler = handler.clone();
            let get_feed_skeleton = warp::path("xrpc")
                .and(warp::path("app.rocksky.feed.getFeedSkeleton"))
                .and(warp::get())
                .and(warp::query::<FeedSkeletonParameters>())
                .and(db_filter.clone())
                .and_then(
                    move |query: FeedSkeletonParameters, _pool: Arc<Pool<Postgres>>| {
                        get_feed_skeleton::<Handler>(query.into(), get_feed_handler.clone())
                    },
                );

            let api = did_json.or(describe_feed_generator).or(get_feed_skeleton);

            tracing::info!("Serving feed on {}", format!("{:?}", address));

            let routes = api.with(warp::log::custom(|info| {
                let method = info.method();
                let path = info.path();
                let status = info.status();
                let elapsed = info.elapsed().as_millis();

                if status.is_success() {
                    tracing::info!(
                        "Method: {}, Path: {}, Status: {}, Elapsed Time: {}ms",
                        method,
                        path,
                        status,
                        elapsed
                    );
                } else {
                    tracing::error!(
                        "Method: {}, Path: {}, Status: {}, Elapsed Time: {}ms",
                        method,
                        path,
                        status,
                        elapsed,
                    );
                }
            }));

            let ddb = DuckdbRepo::new().await?;
            let ddb = RepoImpl::Duckdb(ddb);
            ddb.clone().create_tables().await?;
            let ddb_clone = ddb.clone();

            let sync_feed = tokio::spawn(async move {
                if !enable_sync {
                    return Ok::<(), Error>(());
                }
                sync_scrobbles(ddb_clone).await?;
                Ok::<(), Error>(())
            });
            let feed_server = warp::serve(routes);
            let firehose_listener = tokio::spawn(async move {
                let jetstream_server = env::var("JETSTREAM_SERVER")
                    .unwrap_or_else(|_| "wss://jetstream2.us-west.bsky.network".to_string());
                let url = format!(
                    "{}/subscribe?wantedCollections=app.rocksky.*",
                    jetstream_server
                );
                let subscriber = ScrobbleSubscriber::new(&url);

                match subscriber.run(ddb).await {
                    Ok(_) => tracing::info!("Firehose listener exited normally"),
                    Err(e) => tracing::error!(error = %e, "Firehose listener exited with error"),
                }

                Ok::<(), Error>(())
            });

            tokio::join!(feed_server.run(address), firehose_listener, sync_feed)
                .1
                .expect("Couldn't await tasks")?;

            Ok::<(), Error>(())
        }
    }
}

async fn did_json(config: Config) -> Result<impl warp::Reply, warp::Rejection> {
    Ok(warp::reply::json(&DidDocument {
        context: vec!["https://www.w3.org/ns/did/v1".to_owned()],
        id: format!("did:web:{}", config.feed_generator_hostname),
        service: vec![Service {
            id: "#rocksky_fg".to_owned(),
            type_: "RockskyFeedGenerator".to_owned(),
            service_endpoint: format!("https://{}", config.feed_generator_hostname),
        }],
    }))
}

async fn describe_feed_generator(_feed_name: String) -> Result<impl warp::Reply, warp::Rejection> {
    Ok(warp::reply::json(&serde_json::json!({})))
}

async fn get_feed_skeleton<Handler: FeedHandler>(
    query: FeedSkeletonQuery,
    handler: Handler,
) -> Result<impl warp::Reply, warp::Rejection> {
    let skeleton = handler
        .serve_feed(Request {
            cursor: query.cursor.clone(),
            feed: query.feed.clone(),
            limit: query.limit.map(u8::from),
        })
        .await;

    Ok::<warp::reply::Json, warp::Rejection>(warp::reply::json(&FeedSkeleton {
        cursor: skeleton.cursor,
        feed: skeleton
            .feed
            .into_iter()
            .map(|uri| SkeletonFeedScrobbleData {
                feed_context: None,
                scrobble: uri.0,
            })
            .collect(),
    }))
}
