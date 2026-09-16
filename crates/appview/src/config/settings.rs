//! The on-disk `config.toml`.
//!
//! Every field is optional. The file is a place to write down overrides, not a
//! setup step — deleting it must leave a working instance, which is what the
//! tests at the bottom pin down.

use serde::Deserialize;
use std::path::{Path, PathBuf};

/// The documented template written to `<data_dir>/config.toml` on first boot.
/// Kept as commented-out defaults so the file doubles as the reference for what
/// can be set, and so an untouched file changes nothing.
pub const TEMPLATE: &str = include_str!("config.template.toml");

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Settings {
    pub server: Server,
    pub database: Database,
    pub indexer: Indexer,
    pub tap: Tap,
    pub backfill: Backfill,
    pub atproto: Atproto,
    pub cache: CacheSettings,
    pub search: Search,
    pub events: Events,
    pub services: Services,
    pub storage: Storage,
    pub web: Web,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Server {
    pub host: Option<String>,
    pub port: Option<u16>,
    /// The public hostname this instance is reached at, e.g.
    /// `rocksky.example.com`. Required for a public deployment: it is what
    /// `public_url` and the ATProto OAuth client identity are derived from.
    /// Hostname only — no scheme, no port, no path.
    pub domain: Option<String>,
    /// Externally reachable base URL, used for the ATProto OAuth client
    /// metadata document and absolute URLs in views.
    pub public_url: Option<String>,
    /// Signing key for this instance's bearer tokens. Leave unset and one is
    /// generated and persisted on first boot.
    pub jwt_secret: Option<String>,
    /// Where unhandled requests go. Unset means "answer everything myself".
    pub upstream_url: Option<String>,
    /// Allowed CORS origins. Unset (the default) allows any origin.
    pub cors_origins: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Database {
    /// `sqlite://…` (default) or `postgres://…` to run against an existing
    /// Rocksky database.
    pub url: Option<String>,
    /// OAuth sessions and the DID cache. Always SQLite.
    pub auth_url: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Indexer {
    pub enabled: Option<bool>,
    pub jetstream_urls: Option<Vec<String>>,
    /// DIDs to index. Empty indexes everything on the firehose.
    pub dids: Option<Vec<String>>,
}

/// Tap (<https://atproto.com/blog/introducing-tap>) is a service that
/// subscribes to a Relay and emits verified, filtered JSON events. Preferred
/// over consuming the firehose directly: it does MST verification, signature
/// checks, backfill and per-repo filtering, so this binary only has to project
/// records.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Tap {
    /// `host:port` of a Tap instance. Unset means Tap is not used.
    pub hostname: Option<String>,
    /// Needed only to register repositories through Tap's management API.
    pub admin_password: Option<String>,
    /// Defaults to on when a hostname is set.
    pub enabled: Option<bool>,
    /// DIDs to register with Tap on startup, so it starts tracking them.
    pub repos: Option<Vec<String>>,
}

/// One-time population of the local database from existing repositories.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Backfill {
    /// DIDs whose repositories are downloaded and ingested. Safe to re-run.
    pub dids: Option<Vec<String>>,
    /// Run the backfill on every startup. Off by default: it is idempotent but
    /// downloads every repository again, which is wasteful once populated.
    pub on_start: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Atproto {
    pub plc_directory_url: Option<String>,
    pub bsky_appview_url: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct CacheSettings {
    /// Unset uses the in-process cache.
    pub redis_url: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Search {
    /// Unset uses SQLite FTS5.
    pub typesense_url: Option<String>,
    pub typesense_api_key: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Events {
    /// Unset fans out in-process, which is all a single binary needs.
    pub nats_url: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Services {
    pub navidrome_url: Option<String>,
    pub navidrome_secret: Option<String>,
    pub spotify_api_url: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub deezer_url: Option<String>,
    pub drift_url: Option<String>,
    pub tracklist_url: Option<String>,
}

/// Object storage for uploaded music and cover art. Unset means uploads are
/// unavailable on this instance; everything else still works.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Storage {
    pub s3_endpoint: Option<String>,
    pub s3_region: Option<String>,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,
    pub s3_bucket: Option<String>,
    pub s3_covers_bucket: Option<String>,
    /// Key that encrypts per-user bring-your-own-storage credentials at rest.
    /// Required only to use that feature.
    pub encryption_key: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Web {
    /// Base URL the embedded UI calls. Unset means "the origin the page was
    /// served from", which is what makes the UI work on localhost, a LAN
    /// address and a public domain without a rebuild.
    pub api_url: Option<String>,
    pub ws_url: Option<String>,
    pub cdn_url: Option<String>,
    pub media_cdn_url: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("cannot read {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("{path} is not valid TOML: {source}")]
    Parse {
        path: PathBuf,
        source: toml::de::Error,
    },
}

impl Settings {
    /// Reads `path`, or returns the defaults when the file does not exist.
    ///
    /// A file that exists but does not parse is an error rather than a silent
    /// fallback: someone wrote it intending it to take effect, and quietly
    /// ignoring a typo'd key is worse than refusing to start.
    pub fn load(path: &Path) -> Result<Self, SettingsError> {
        let raw = match std::fs::read_to_string(path) {
            Ok(raw) => raw,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(source) => {
                return Err(SettingsError::Read {
                    path: path.to_path_buf(),
                    source,
                })
            }
        };

        toml::from_str(&raw).map_err(|source| SettingsError::Parse {
            path: path.to_path_buf(),
            source,
        })
    }

    /// Writes the documented template if no config file is there yet, so a
    /// fresh install has something to read and edit. Never overwrites.
    pub fn write_template_if_absent(path: &Path) {
        if path.exists() {
            return;
        }
        match std::fs::write(path, TEMPLATE) {
            Ok(()) => tracing::info!("wrote a starter config to {}", path.display()),
            // Not fatal: an unwritable data directory still runs on defaults.
            Err(err) => tracing::warn!(
                error = %err,
                path = %path.display(),
                "could not write the starter config"
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_yields_defaults() {
        let settings = Settings::load(Path::new("/nonexistent/rocksky/config.toml")).unwrap();
        assert!(settings.server.port.is_none());
        assert!(settings.database.url.is_none());
    }

    #[test]
    fn the_shipped_template_parses_and_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        Settings::write_template_if_absent(&path);

        let settings = Settings::load(&path).expect("the template must be valid TOML");
        // Everything in the template is commented out, so an untouched file is
        // indistinguishable from no file at all.
        assert!(settings.server.port.is_none());
        assert!(settings.server.jwt_secret.is_none());
        assert!(settings.database.url.is_none());
        assert!(settings.cache.redis_url.is_none());
        assert!(settings.indexer.enabled.is_none());
    }

    #[test]
    fn the_template_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "[server]\nport = 9999\n").unwrap();

        Settings::write_template_if_absent(&path);

        let settings = Settings::load(&path).unwrap();
        assert_eq!(settings.server.port, Some(9999), "user edits must survive");
    }

    #[test]
    fn sections_are_read() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(
            &path,
            r#"
[server]
host = "127.0.0.1"
port = 8080
cors_origins = ["https://rocksky.app"]

[database]
url = "postgres://localhost/rocksky"

[indexer]
enabled = false
dids = ["did:plc:abc", "did:plc:def"]

[cache]
redis_url = "redis://localhost:6379"

[web]
api_url = "https://api.example.test"
"#,
        )
        .unwrap();

        let settings = Settings::load(&path).unwrap();
        assert_eq!(settings.server.host.as_deref(), Some("127.0.0.1"));
        assert_eq!(settings.server.port, Some(8080));
        assert_eq!(
            settings.server.cors_origins.as_deref(),
            Some(["https://rocksky.app".to_string()].as_slice())
        );
        assert_eq!(
            settings.database.url.as_deref(),
            Some("postgres://localhost/rocksky")
        );
        assert_eq!(settings.indexer.enabled, Some(false));
        assert_eq!(settings.indexer.dids.as_ref().unwrap().len(), 2);
        assert_eq!(
            settings.cache.redis_url.as_deref(),
            Some("redis://localhost:6379")
        );
        assert_eq!(
            settings.web.api_url.as_deref(),
            Some("https://api.example.test")
        );
    }

    #[test]
    fn an_unknown_key_is_reported_rather_than_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        // A typo that silently did nothing would be very hard to debug.
        std::fs::write(&path, "[server]\nprot = 8080\n").unwrap();

        let err = Settings::load(&path).expect_err("a typo'd key must not be ignored");
        assert!(matches!(err, SettingsError::Parse { .. }), "{err:?}");
    }

    #[test]
    fn malformed_toml_is_an_error_not_a_silent_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "[server\nport = ").unwrap();

        let err = Settings::load(&path).expect_err("broken TOML must be reported");
        assert!(matches!(err, SettingsError::Parse { .. }), "{err:?}");
    }
}
