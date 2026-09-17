//! Where a Rocksky service's database is, when nobody told it.
//!
//! Every service in this repository reads and writes one schema. In the
//! deployed system that is a Postgres, named by `XATA_POSTGRES_URL` and
//! friends, and a service with no Postgres URL simply refused to start. That
//! made the self-hosted story a lie: `rocksky-appview` runs happily on a
//! SQLite file, and then Subsonic, Jellyfin, the mirror and the Spotify poller
//! could not join it, so a self-hosted instance had a web UI and no music
//! services.
//!
//! This is the one place that decides. The rule, in order:
//!
//! | condition                                   | result                     |
//! |---------------------------------------------|----------------------------|
//! | `XATA_WRITE_POSTGRES_URL` / `XATA_READ_POSTGRES_URL` set | split Postgres |
//! | `XATA_POSTGRES_URL` set                     | one Postgres               |
//! | `APPVIEW_DB_URL` set                        | whatever it names          |
//! | nothing set                                 | the shared SQLite file     |
//!
//! The Postgres variables come first and keep their existing meaning, so a
//! deployment that sets them is completely unaffected by any of this.
//!
//! # The shared file
//!
//! [`default_sqlite_path`] resolves to the *same* path `rocksky-appview`
//! computes for itself, because the whole point is that these processes meet in
//! one database. It is opened in WAL mode (see [`crate::Backend::connect`]),
//! which is what makes that safe: readers do not block the writer, and several
//! processes on one host can hold it at once.
//!
//! Two things follow from it being a file rather than a server:
//!
//!   * the processes have to be on the same machine, and in Docker they have to
//!     share the volume. A service in its own container with its own volume
//!     will quietly create an empty database and report an empty library.
//!   * `ROCKSKY_DATA_DIR` moves it, and is the setting to use when the default
//!     (`$XDG_DATA_HOME/rocksky`, or `~/.rocksky`) is not where the appview
//!     keeps its data.
//!
//! Neither is a limitation of SQLite so much as the price of not running a
//! database server; a deployment that outgrows it sets a Postgres URL.

use crate::{Backend, ConnectError};
use std::path::PathBuf;

/// The file name inside the data directory. The appview's own default.
const DATABASE_FILE: &str = "rocksky.db";

/// What a service ended up connecting to, for its startup log.
///
/// Worth reporting: "no music in Subsonic" and "the appview is on Postgres
/// while Subsonic made its own SQLite file" look identical from the outside,
/// and this is the line that tells them apart.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    /// A Postgres, with a separate read replica.
    SplitPostgres,
    /// One Postgres for reads and writes.
    Postgres,
    /// The shared SQLite file, at this path.
    Sqlite(PathBuf),
    /// A URL given explicitly, which may be either.
    Explicit,
}

impl std::fmt::Display for Source {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Source::SplitPostgres => write!(f, "postgres (split read/write)"),
            Source::Postgres => write!(f, "postgres"),
            Source::Sqlite(path) => write!(f, "sqlite {}", path.display()),
            Source::Explicit => write!(f, "the configured database"),
        }
    }
}

/// The directory Rocksky keeps its data in.
///
/// Deliberately identical to `rocksky-appview`'s own resolution, including the
/// order: a service that computed this differently would open a different file
/// and find it empty.
pub fn default_data_dir() -> PathBuf {
    if let Some(dir) = env_opt("ROCKSKY_DATA_DIR") {
        return PathBuf::from(dir);
    }
    if let Some(dir) = env_opt("XDG_DATA_HOME") {
        return PathBuf::from(dir).join("rocksky");
    }
    if let Some(home) = env_opt("HOME").or_else(|| env_opt("USERPROFILE")) {
        return PathBuf::from(home).join(".rocksky");
    }
    PathBuf::from(".rocksky")
}

/// The SQLite file every service shares when there is no Postgres.
pub fn default_sqlite_path() -> PathBuf {
    default_data_dir().join(DATABASE_FILE)
}

/// The URL to connect to, and what kind of thing it is.
///
/// Separate from [`connect`] so the decision can be asserted without a
/// database, which is the part worth testing: an environment that should have
/// chosen Postgres and quietly chose a file is the failure this guards.
pub fn resolve() -> (String, Source) {
    let write = env_opt("XATA_WRITE_POSTGRES_URL");
    let read = env_opt("XATA_READ_POSTGRES_URL");
    let both = env_opt("XATA_POSTGRES_URL");

    // A split deployment sets one or both of the specific variables; either
    // alone still implies Postgres, with the fallback covering the other half.
    if write.is_some() || read.is_some() {
        if let Some(url) = write.or_else(|| both.clone()).or(read) {
            return (url, Source::SplitPostgres);
        }
    }
    if let Some(url) = both {
        return (url, Source::Postgres);
    }
    if let Some(url) = env_opt("APPVIEW_DB_URL") {
        return (url, Source::Explicit);
    }

    let path = default_sqlite_path();
    // `mode=rwc` so the file is created on first use rather than being a
    // startup error — a fresh self-host has no database yet, and the appview
    // creates the schema in it.
    (
        format!("sqlite://{}?mode=rwc", path.display()),
        Source::Sqlite(path),
    )
}

/// The read replica URL, when one is configured.
pub fn replica_url() -> Option<String> {
    env_opt("XATA_READ_POSTGRES_URL")
}

/// Connects a service to whatever [`resolve`] chose.
///
/// The `Source` comes back so the caller can log it. Creating the data
/// directory is part of the job: the appview makes it, but a service may well
/// start first.
pub async fn connect() -> Result<(Backend, Source), ConnectError> {
    let (url, source) = resolve();

    if let Source::Sqlite(path) = &source {
        if let Some(parent) = path.parent() {
            // Best effort: if this fails, the connection below fails with a
            // message about the actual file, which is more useful than one
            // about a directory.
            let _ = std::fs::create_dir_all(parent);
        }
    }

    let backend = match source {
        Source::SplitPostgres => Backend::connect_split(&url, replica_url().as_deref()).await?,
        _ => Backend::connect(&url).await?,
    };
    Ok((backend, source))
}

fn env_opt(key: &str) -> Option<String> {
    // An empty value means "not configured" rather than "connect to nothing":
    // deployment tooling sets blanks far more often than it unsets.
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// These tests mutate the process environment, so they take a lock rather
    /// than racing each other. `cargo test` runs them on one process.
    fn lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Restores every variable this module reads, so one test cannot decide
    /// another's answer.
    struct Env(Vec<(&'static str, Option<String>)>);

    impl Env {
        fn new() -> Self {
            let keys = [
                "XATA_WRITE_POSTGRES_URL",
                "XATA_READ_POSTGRES_URL",
                "XATA_POSTGRES_URL",
                "APPVIEW_DB_URL",
                "ROCKSKY_DATA_DIR",
                "XDG_DATA_HOME",
                "HOME",
            ];
            let saved = keys
                .iter()
                .map(|key| (*key, std::env::var(key).ok()))
                .collect();
            for key in keys {
                std::env::remove_var(key);
            }
            Self(saved)
        }

        fn set(&self, key: &str, value: &str) {
            std::env::set_var(key, value);
        }
    }

    impl Drop for Env {
        fn drop(&mut self) {
            for (key, value) in &self.0 {
                match value {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }

    /// A deployment that sets a Postgres URL must be completely unaffected by
    /// the existence of the fallback.
    #[test]
    fn postgres_wins_whenever_it_is_configured() {
        let _guard = lock();
        let env = Env::new();

        env.set("XATA_POSTGRES_URL", "postgres://host/rocksky");
        assert_eq!(
            resolve(),
            ("postgres://host/rocksky".into(), Source::Postgres)
        );

        // The specific variables mean a split deployment, which connects
        // differently — reads can go to the replica.
        env.set("XATA_WRITE_POSTGRES_URL", "postgres://primary/rocksky");
        env.set("XATA_READ_POSTGRES_URL", "postgres://replica/rocksky");
        assert_eq!(
            resolve(),
            ("postgres://primary/rocksky".into(), Source::SplitPostgres)
        );
        assert_eq!(replica_url().as_deref(), Some("postgres://replica/rocksky"));
    }

    /// A read-only URL alone is still Postgres: the write half falls back to
    /// `XATA_POSTGRES_URL`, which is how the existing deployments are set up.
    #[test]
    fn a_replica_alone_still_means_postgres() {
        let _guard = lock();
        let env = Env::new();

        env.set("XATA_READ_POSTGRES_URL", "postgres://replica/rocksky");
        env.set("XATA_POSTGRES_URL", "postgres://primary/rocksky");
        assert_eq!(
            resolve(),
            ("postgres://primary/rocksky".into(), Source::SplitPostgres)
        );
    }

    /// An empty value is tooling setting a blank, not a request to connect to
    /// nothing — it must not shadow the fallback.
    #[test]
    fn a_blank_url_is_not_a_configuration() {
        let _guard = lock();
        let env = Env::new();
        env.set("ROCKSKY_DATA_DIR", "/tmp/rocksky-test");

        env.set("XATA_POSTGRES_URL", "");
        env.set("XATA_WRITE_POSTGRES_URL", "   ");
        let (url, source) = resolve();
        assert!(url.starts_with("sqlite://"), "{url}");
        assert_eq!(
            source,
            Source::Sqlite("/tmp/rocksky-test/rocksky.db".into())
        );
    }

    /// With nothing configured, every service has to land on the same file, or
    /// they each get their own empty database and report an empty library.
    #[test]
    fn with_no_postgres_every_service_lands_on_one_file() {
        let _guard = lock();
        let env = Env::new();
        env.set("ROCKSKY_DATA_DIR", "/srv/rocksky");

        let (url, source) = resolve();
        assert_eq!(url, "sqlite:///srv/rocksky/rocksky.db?mode=rwc");
        assert_eq!(source, Source::Sqlite("/srv/rocksky/rocksky.db".into()));
        // `mode=rwc`, so a fresh self-host creates the file rather than
        // failing to start.
        assert!(url.contains("mode=rwc"));
    }

    /// The same order the appview uses, so the two agree on the path.
    #[test]
    fn the_data_directory_follows_the_appviews_rules() {
        let _guard = lock();
        let env = Env::new();

        env.set("HOME", "/home/someone");
        assert_eq!(default_data_dir(), PathBuf::from("/home/someone/.rocksky"));

        env.set("XDG_DATA_HOME", "/home/someone/.local/share");
        assert_eq!(
            default_data_dir(),
            PathBuf::from("/home/someone/.local/share/rocksky")
        );

        // And the explicit setting beats both.
        env.set("ROCKSKY_DATA_DIR", "/data");
        assert_eq!(default_data_dir(), PathBuf::from("/data"));
        assert_eq!(default_sqlite_path(), PathBuf::from("/data/rocksky.db"));
    }

    /// An explicitly configured URL is passed through whichever kind it is —
    /// this is the escape hatch for a service pointed at something unusual.
    #[test]
    fn an_explicit_url_is_used_as_given() {
        let _guard = lock();
        let env = Env::new();

        env.set("APPVIEW_DB_URL", "sqlite:///tmp/elsewhere.db?mode=rwc");
        assert_eq!(
            resolve(),
            (
                "sqlite:///tmp/elsewhere.db?mode=rwc".into(),
                Source::Explicit
            )
        );
    }

    /// Connecting with nothing configured produces a usable database, and the
    /// reported source says where it went.
    #[tokio::test]
    async fn connecting_with_no_configuration_works() {
        let _guard = lock();
        let env = Env::new();
        let dir = tempfile::tempdir().unwrap();
        env.set("ROCKSKY_DATA_DIR", dir.path().to_str().unwrap());

        let (db, source) = connect().await.expect("a fallback connection");
        assert_eq!(db.dialect(), crate::Dialect::Sqlite);
        assert!(matches!(source, Source::Sqlite(_)));
        assert!(dir.path().join(DATABASE_FILE).exists(), "the file was made");
    }
}
