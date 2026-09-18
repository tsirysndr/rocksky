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

        // A Postgres URL when one is given, and otherwise the SQLite file the
        // appview uses — this service only reads the scrobbles, so joining the
        // self-hosted database is exactly as valid as joining a Postgres.
        // `rocksky_db::shared` is the one place that decides, so every service
        // lands on the same file.
        let (database_url, source) = match cli.database_url.filter(|url| !url.is_empty()) {
            Some(url) => (url, None),
            None => {
                let (url, source) = rocksky_db::shared::resolve();
                (url, Some(source))
            }
        };
        if let Some(source) = source {
            tracing::info!(database = %source, "no database configured; using the shared one");
        }

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

    /// With no database configured this used to refuse to start, which is
    /// what kept the service behind a compose profile. It joins the shared
    /// database instead now — it only reads scrobbles, so a self-hosted
    /// SQLite file is as valid a source as a Postgres.
    #[test]
    fn no_database_falls_back_to_the_shared_one() {
        let _guard = env_lock();
        // Blank rather than removed: `Config::load` runs `dotenv`, and the
        // repository's own `.env` names a Postgres. dotenv does not overwrite
        // a variable that is already set, and a blank one reads as unset.
        let _vars = BlankPostgres::new();
        std::env::set_var("ROCKSKY_DATA_DIR", "/srv/rocksky");

        let config = Config::load(Cli {
            host: None,
            port: None,
            domain: None,
            database_url: None,
            read_database_url: None,
            publisher_did: None,
        })
        .expect("the shared database is a valid answer");

        assert_eq!(
            config.database_url,
            "sqlite:///srv/rocksky/rocksky.db?mode=rwc"
        );
        std::env::remove_var("ROCKSKY_DATA_DIR");
    }

    /// An explicit URL still wins, so a Postgres deployment is unaffected.
    #[test]
    fn an_explicit_url_is_used_as_given() {
        let _guard = env_lock();
        let config = Config::load(Cli {
            host: None,
            port: None,
            domain: None,
            database_url: Some("postgres://host/rocksky".into()),
            read_database_url: None,
            publisher_did: None,
        })
        .expect("a config");
        assert_eq!(config.database_url, "postgres://host/rocksky");
    }

    /// These read process-wide environment, so they take a lock rather than
    /// racing each other.
    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Blanks the Postgres variables for the duration of a test, and puts
    /// whatever was there back afterwards.
    struct BlankPostgres(Vec<(&'static str, Option<String>)>);

    impl BlankPostgres {
        fn new() -> Self {
            const KEYS: [&str; 4] = [
                "XATA_POSTGRES_URL",
                "XATA_WRITE_POSTGRES_URL",
                "XATA_READ_POSTGRES_URL",
                "APPVIEW_DB_URL",
            ];
            let saved = KEYS
                .iter()
                .map(|key| (*key, std::env::var(key).ok()))
                .collect();
            for key in KEYS {
                std::env::set_var(key, "");
            }
            Self(saved)
        }
    }

    impl Drop for BlankPostgres {
        fn drop(&mut self) {
            for (key, value) in &self.0 {
                match value {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }
}
