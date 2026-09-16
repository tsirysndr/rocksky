//! Configuration, with the same environment variable names `apps/feeds` uses
//! so an existing deployment's `.env` works unchanged.

use clap::Parser;

/// Where this generator listens, when nothing says otherwise.
pub const DEFAULT_PORT: u16 = 8002;

/// The account that publishes the feed records upstream.
///
/// Hard-coded in `apps/feeds` to the rocksky.app account. Kept as the default
/// so the deployed service behaves identically, but configurable: a
/// self-hosted instance advertising feeds under someone else's DID would be
/// claiming records it cannot write.
pub const DEFAULT_PUBLISHER_DID: &str = "did:plc:vegqomyce4ssoqs7zwqvgqty";

#[derive(Debug, Parser)]
#[command(about = "The Rocksky ATProto feed generator")]
pub struct Cli {
    /// Address to bind.
    #[arg(long, value_name = "HOST", env = "ROCKSKY_FEEDGEN_HOST")]
    pub host: Option<String>,

    /// Port to listen on.
    #[arg(short, long, value_name = "PORT", env = "ROCKSKY_FEEDGEN_PORT")]
    pub port: Option<u16>,

    /// The hostname this generator is reached at. Its `did:web` is derived
    /// from this, so it must be the public name.
    #[arg(long, value_name = "HOST", env = "ROCKSKY_FEEDGEN_DOMAIN")]
    pub domain: Option<String>,

    /// The database holding the scrobbles.
    #[arg(long, value_name = "URL", env = "XATA_POSTGRES_URL")]
    pub database_url: Option<String>,

    /// A read replica. Preferred for every query, since a feed tolerates lag.
    #[arg(long, value_name = "URL", env = "XATA_READ_POSTGRES_URL")]
    pub read_database_url: Option<String>,

    /// The DID whose repository holds the feed records.
    #[arg(long, value_name = "DID", env = "ROCKSKY_FEEDGEN_PUBLISHER_DID")]
    pub publisher_did: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub domain: String,
    pub database_url: String,
    pub read_database_url: Option<String>,
    pub publisher_did: String,
}

impl Config {
    pub fn load(cli: Cli) -> anyhow::Result<Self> {
        let _ = dotenv::dotenv();

        let database_url = cli
            .database_url
            .filter(|url| !url.is_empty())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "no database configured: set XATA_POSTGRES_URL (or --database-url) to the \
                     Rocksky database holding the scrobbles"
                )
            })?;

        Ok(Self {
            host: cli.host.unwrap_or_else(|| "0.0.0.0".to_string()),
            port: cli.port.unwrap_or(DEFAULT_PORT),
            // Defaults to localhost so a local run works; a deployment must
            // set it, since the did:web is built from it.
            domain: cli.domain.unwrap_or_else(|| "localhost".to_string()),
            database_url,
            read_database_url: cli.read_database_url.filter(|url| !url.is_empty()),
            publisher_did: cli
                .publisher_did
                .filter(|did| !did.is_empty())
                .unwrap_or_else(|| DEFAULT_PUBLISHER_DID.to_string()),
        })
    }

    /// This service's own DID.
    pub fn own_did(&self) -> String {
        format!("did:web:{}", self.domain)
    }

    /// The AT-URI of one feed, in the publisher's repository.
    pub fn feed_uri(&self, rkey: &str) -> String {
        format!(
            "at://{}/app.rocksky.feed.generator/{rkey}",
            self.publisher_did
        )
    }

    /// A config for tests.
    pub fn for_test() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 0,
            domain: "feeds.example.com".into(),
            database_url: "sqlite::memory:".into(),
            read_database_url: None,
            publisher_did: DEFAULT_PUBLISHER_DID.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The DID and the feed URIs are what clients resolve and subscribe to, so
    /// their shape is a contract.
    #[test]
    fn the_identity_is_derived_from_the_domain() {
        let config = Config::for_test();
        assert_eq!(config.own_did(), "did:web:feeds.example.com");
        assert_eq!(
            config.feed_uri("metalcore"),
            "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore"
        );
    }

    /// A missing database is a startup error naming the variable, not a
    /// process that starts and fails every request.
    #[test]
    fn no_database_is_refused_with_a_useful_message() {
        let error = Config::load(Cli {
            host: None,
            port: None,
            domain: None,
            database_url: None,
            read_database_url: None,
            publisher_did: None,
        })
        .unwrap_err()
        .to_string();

        assert!(error.contains("XATA_POSTGRES_URL"), "{error}");
    }
}
