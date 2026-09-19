//! Configuration for a self-hosted Rocksky.
//!
//! The design rule is different from `apps/api/src/lib/env.ts`: **nothing is
//! required**. `rocksky-appview` with an empty environment and no config file
//! must boot, create its own SQLite database under the data directory, mint and
//! persist its own signing key, and serve the embedded web UI.
//!
//! Settings resolve highest-first:
//!
//! 1. command-line flags ([`Cli`])
//! 2. environment variables — names match the TypeScript API wherever both read
//!    the same thing, so an existing `.env` keeps working
//! 3. `config.toml` in the data directory ([`Settings`])
//! 4. the built-in defaults here

pub mod generate;
pub mod settings;

use clap::Parser;
use settings::{Settings, SettingsError};
use std::env;
use std::fmt;
use std::path::{Path, PathBuf};

pub use settings::TEMPLATE as CONFIG_TEMPLATE;

/// Command-line overrides. Everything is optional — running the binary bare is
/// the intended path.
#[derive(Debug, Clone, Default, Parser)]
#[command(
    name = "rocksky-appview",
    about = "Self-hosted Rocksky: the app.rocksky.* XRPC API, the web UI and the \
             firehose indexer in one binary.",
    version
)]
pub struct Cli {
    /// Path to config.toml. Defaults to <data-dir>/config.toml.
    ///
    /// Naming it explicitly also stops the starter template being written:
    /// that only happens at the default location, so a deployment pointing at
    /// `/etc/rocksky/config.toml` is never surprised by a file appearing
    /// beside the one it asked for.
    #[arg(short = 'c', long, value_name = "PATH", env = "ROCKSKY_CONFIG")]
    pub config: Option<PathBuf>,

    /// Directory for the databases, the signing key and config.toml.
    #[arg(long, value_name = "PATH", env = "ROCKSKY_DATA_DIR")]
    pub data_dir: Option<PathBuf>,

    /// Address to bind.
    #[arg(long, value_name = "HOST")]
    pub host: Option<String>,

    /// Port to listen on.
    #[arg(short, long, value_name = "PORT")]
    pub port: Option<u16>,

    /// Public hostname this instance is reached at, e.g. rocksky.example.com.
    /// Required for a public deployment.
    #[arg(long, value_name = "HOST", env = "ROCKSKY_DOMAIN")]
    pub domain: Option<String>,

    /// Database URL: sqlite://… (default) or postgres://… for an existing
    /// Rocksky database.
    #[arg(long, value_name = "URL")]
    pub database_url: Option<String>,

    /// Externally reachable base URL of this instance.
    #[arg(long, value_name = "URL")]
    pub public_url: Option<String>,

    /// Do not index from the ATProto firehose.
    #[arg(long)]
    pub no_indexer: bool,

    /// Print the resolved configuration and exit.
    #[arg(long)]
    pub print_config: bool,

    /// Write a config.toml with every secret filled in, then exit.
    ///
    /// Secrets already in the data directory are reused rather than replaced,
    /// so this is safe to run against a live instance.
    #[arg(long)]
    pub generate_config: bool,

    /// Overwrite an existing config.toml. Only meaningful with
    /// --generate-config, and destructive: the file may hold the only copy of
    /// this instance's secrets.
    #[arg(long)]
    pub force: bool,

    /// Backfill the database from the configured repositories, then exit
    /// without starting the server. Safe to re-run.
    #[arg(long)]
    pub backfill: bool,
}

/// Where NATS is, when nothing says otherwise.
///
/// A local one, which is what the docker-compose file provides and what a
/// developer running `nats-server` already has.
pub const DEFAULT_NATS_URL: &str = "nats://127.0.0.1:4222";

/// The account whose repository publishes the Rocksky feed generators.
pub const DEFAULT_FEED_PUBLISHER_DID: &str = "did:plc:vegqomyce4ssoqs7zwqvgqty";

/// Where the Spotify authorization and token endpoints live.
///
/// Not `api.spotify.com` and therefore not `[services].spotify_api_url`: the
/// OAuth handshake is a different host from the Web API, and the proxy in
/// `spotify/` forwards only the latter.
pub const DEFAULT_SPOTIFY_ACCOUNTS_URL: &str = "https://accounts.spotify.com";

/// Where Typesense is, when nothing says otherwise.
pub const DEFAULT_TYPESENSE_URL: &str = "http://127.0.0.1:8108";

/// The API key Typesense is started with in the docker-compose file.
///
/// A default at all, rather than a required secret, because Typesense here is
/// an internal index on a private network — it holds no credentials and nothing
/// a reader could not get from the public API. Making it mandatory would stop a
/// zero-config boot for no gain; an instance that exposes Typesense publicly
/// should set its own.
pub const DEFAULT_TYPESENSE_API_KEY: &str = "rocksky";

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,

    /// Directory holding the databases, the signing key and `config.toml`.
    pub data_dir: PathBuf,
    pub config_path: PathBuf,

    /// The appview projections. `sqlite://…` or `postgres://…`.
    pub database_url: String,
    /// A Postgres read replica, if one is configured.
    pub read_database_url: Option<String>,
    /// OAuth sessions, OAuth state and the DID document cache. Always SQLite.
    pub auth_database_url: String,

    /// Signing key for this instance's bearer tokens. Generated on first boot
    /// and persisted to `<data_dir>/jwt.secret` when not supplied.
    pub jwt_secret: String,

    /// The public hostname, when one is configured. `None` means this instance
    /// is only reachable at whatever address the client used, which is fine on
    /// a laptop and not fine on a VPS — see [`Config::is_public_ready`].
    pub domain: Option<String>,

    /// Externally reachable base URL, for the ATProto OAuth client metadata
    /// document and absolute URLs in views. Derived from `domain` when that is
    /// set.
    pub public_url: String,

    /// Optional upstream for requests this binary does not answer itself. Unset
    /// by default — a self-hosted instance is meant to be complete on its own.
    /// Setting it reproduces the `http-proxy-middleware` fallback that
    /// `apps/api/src/server.ts` uses to reach the legacy REST app on :8000.
    pub upstream_url: Option<String>,

    /// Browser origins allowed to call the API. `None` allows any origin, which
    /// is the default: a personal instance is typically called from whatever
    /// host the owner happens to be on.
    pub cors_origins: Option<Vec<String>>,

    /// Jetstream endpoints the indexer consumes to fill the local database.
    pub jetstream_urls: Vec<String>,
    /// DIDs whose `app.rocksky.*` records this instance indexes. Empty means
    /// "everything on the firehose", which is what a public appview does; a
    /// personal instance normally lists just its own accounts.
    pub indexer_dids: Vec<String>,
    /// On by default: without it a fresh self-host has nothing to show.
    pub indexer_enabled: bool,
    /// Run the denormalised-URI repair at startup. On by default.
    pub repair_uris: bool,
    /// Rebuild the search index from the database at startup. On by default.
    pub search_backfill: bool,

    /// A Tap instance to consume verified, filtered events from. `None` means
    /// Tap is not used; see [`settings::Tap`].
    pub tap_hostname: Option<String>,
    pub tap_admin_password: Option<String>,
    pub tap_enabled: bool,
    /// DIDs to register with Tap on startup.
    pub tap_repos: Vec<String>,

    /// Repositories to populate the database from at startup, by downloading
    /// and ingesting their CARs. Idempotent, so safe to leave set.
    pub backfill_dids: Vec<String>,
    pub backfill_on_start: bool,

    /// Where to fetch artist pictures and genres from.
    ///
    /// The hosted API by default: it has already resolved them for most
    /// artists anybody has scrobbled, and a self-hosted instance has no
    /// credentials for the four upstreams it would otherwise have to ask.
    /// Empty disables the sweep.
    pub artist_metadata_url: String,

    /// Whose repository holds the `app.rocksky.feed.generator` records.
    ///
    /// The feed registry is a projection of those records, and a self-hosted
    /// instance has no reason to be following the account that publishes them
    /// — so they are read directly at startup. Defaults to rocksky.app's, so
    /// a new instance offers the same feeds as the hosted one; set it to your
    /// own DID to publish your own.
    pub feed_publisher_did: String,

    pub plc_directory_url: String,
    pub bsky_appview_url: String,

    /// The infrastructure this instance needs.
    ///
    /// - `redis_url`: a shared response cache. Genuinely optional — without it
    ///   the cache is an in-process TTL map, which is all a single instance
    ///   needs. Only a second instance behind the same hostname requires it.
    /// - `typesense_*`: the search index. **Required** — see `crate::search`.
    /// - `nats_url`: the event bus. **Required** — see `crate::events`.
    ///
    /// The two required ones default to a local server on its standard port,
    /// which is what the docker-compose file provides. So "required" costs an
    /// operator nothing when they use that file, and is an explicit failure at
    /// boot when they do not — rather than a running instance with no search
    /// box and no scrobble mirrors.
    pub redis_url: Option<String>,
    pub typesense_url: String,
    pub typesense_api_key: String,
    pub nats_url: String,

    /// Optional companion services. `None` means "feature off", never
    /// "misconfigured" — handlers that need one answer 501 instead of crashing.
    /// DIDs for whom teal.fm push defaults to off.
    ///
    /// Only a default: someone who has chosen explicitly keeps their choice —
    /// see `crate::xrpc::app_rocksky::mirror`. Exists because teal.fm asked
    /// for specific accounts not to be mirrored by default.
    pub disabled_tealfm: Vec<String>,

    /// The operator's switch over teal.fm publishing for the whole instance.
    ///
    /// Off writes no `fm.teal.*` record at all, whatever anyone has chosen for
    /// themselves — unlike `disabled_tealfm`, which only moves the default.
    pub tealfm_enabled: bool,

    pub navidrome_internal_url: Option<String>,
    pub navidrome_internal_secret: Option<String>,
    pub spotify_api_url: Option<String>,

    /// Connecting a listener's Spotify account. All of `client_id`,
    /// `client_secret`, `redirect_uri`, `encryption_key` and `encryption_iv`
    /// are needed before `/spotify/login` will do anything.
    pub spotify_client_id: Option<String>,
    pub spotify_client_secret: Option<String>,
    pub spotify_redirect_uri: Option<String>,
    pub spotify_encryption_key: Option<String>,
    pub spotify_encryption_iv: Option<String>,
    pub spotify_accounts_url: String,

    pub musicbrainz_url: Option<String>,
    pub deezer_url: Option<String>,
    pub drift_url: Option<String>,
    pub tracklist_url: Option<String>,

    /// Object storage for uploads. `None` for any of these means uploads are
    /// unavailable — the rest of the instance is unaffected.
    pub s3: Option<S3Config>,
    /// Encrypts credentials at rest: access-token copies and per-user
    /// bring-your-own-storage secrets. Generated and persisted on first boot
    /// when not supplied, so issuing an access token needs no setup.
    pub storage_encryption_key: String,

    pub cdn_url: String,
    pub media_cdn_url: String,

    /// Overrides for the config injected into the embedded SPA. `None` means
    /// "derive from the request's own origin", which is what makes the UI work
    /// on localhost, a LAN IP and a public domain without a rebuild.
    pub web_api_url: Option<String>,
    pub web_ws_url: Option<String>,
}

/// S3-compatible object storage for uploaded audio and cover art.
///
/// Constructed only when all four required values are present, so a handler
/// holding an `S3Config` never has to re-check for a half-configured bucket.
#[derive(Debug, Clone)]
pub struct S3Config {
    pub endpoint: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub bucket: String,
    pub covers_bucket: String,
}

pub const DEFAULT_JETSTREAM_URLS: &[&str] = &[
    "wss://jetstream1.us-east.bsky.network/subscribe",
    "wss://jetstream2.us-east.bsky.network/subscribe",
    "wss://jetstream1.us-west.bsky.network/subscribe",
    "wss://jetstream2.us-west.bsky.network/subscribe",
];

#[derive(Debug)]
pub enum ConfigError {
    DataDir {
        path: PathBuf,
        source: std::io::Error,
    },
    Secret {
        path: PathBuf,
        source: std::io::Error,
    },
    Settings(SettingsError),
}

/// Whether a database URL names Postgres.
fn is_postgres(url: &str) -> bool {
    url.starts_with("postgres:") || url.starts_with("postgresql:")
}

/// A database URL with any password removed, for an error message.
///
/// These strings carry credentials, and a misconfiguration is exactly when
/// somebody pastes the output into an issue.
fn redact_url(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once("://") else {
        return url.to_string();
    };
    match rest.split_once('@') {
        Some((credentials, host)) => {
            let user = credentials.split_once(':').map_or(credentials, |(u, _)| u);
            format!("{scheme}://{user}:***@{host}")
        }
        None => url.to_string(),
    }
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DataDir { path, source } => {
                write!(
                    f,
                    "cannot create data directory {}: {source}",
                    path.display()
                )
            }
            Self::Secret { path, source } => {
                write!(f, "cannot read or write {}: {source}", path.display())
            }
            Self::Settings(source) => write!(f, "{source}"),
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::DataDir { source, .. } | Self::Secret { source, .. } => Some(source),
            Self::Settings(source) => Some(source),
        }
    }
}

impl From<SettingsError> for ConfigError {
    fn from(source: SettingsError) -> Self {
        Self::Settings(source)
    }
}

fn env_opt(key: &str) -> Option<String> {
    match env::var(key) {
        Ok(v) if !v.trim().is_empty() => Some(v.trim().to_string()),
        _ => None,
    }
}

/// Resolves one setting: CLI, then environment, then the config file, then the
/// default. Returning `Option` lets "unset everywhere" stay meaningful for the
/// optional services.
fn pick(cli: Option<String>, env_key: &str, file: Option<String>) -> Option<String> {
    cli.or_else(|| env_opt(env_key)).or(file)
}

fn pick_or(cli: Option<String>, env_key: &str, file: Option<String>, default: &str) -> String {
    pick(cli, env_key, file).unwrap_or_else(|| default.to_string())
}

/// The address this instance calls itself, in precedence order.
///
/// An explicit setting wins; otherwise a domain implies https, which is the
/// only thing a public deployment can be. With neither, localhost is the
/// honest answer — and the port has to be the resolved one, since it is the
/// address a browser was told to use.
///
/// Separate from [`Config::load`] so the order can be tested without setting
/// environment variables, which would race the other tests in this module.
fn resolve_public_url(
    cli: Option<String>,
    env: Option<String>,
    file: Option<String>,
    domain: Option<&str>,
    port: u16,
) -> String {
    cli.or(env)
        .or(file)
        .or_else(|| domain.map(|domain| format!("https://{domain}")))
        .unwrap_or_else(|| format!("http://localhost:{port}"))
}

fn env_flag(key: &str) -> Option<bool> {
    env_opt(key)
        .map(|v| v.to_ascii_lowercase())
        .map(|v| !matches!(v.as_str(), "0" | "false" | "no" | "off"))
}

/// Splits a comma-separated environment variable into a list.
fn env_list(key: &str) -> Option<Vec<String>> {
    env_opt(key).map(|value| {
        value
            .split(',')
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect()
    })
}

/// `--data-dir`, `$ROCKSKY_DATA_DIR`, `$XDG_DATA_HOME/rocksky`, `~/.rocksky`,
/// or `./.rocksky` for a process with no home directory at all.
fn default_data_dir(cli: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = cli {
        return dir;
    }
    if let Some(dir) = env_opt("XDG_DATA_HOME") {
        return PathBuf::from(dir).join("rocksky");
    }
    if let Some(home) = env_opt("HOME").or_else(|| env_opt("USERPROFILE")) {
        return PathBuf::from(home).join(".rocksky");
    }
    PathBuf::from(".rocksky")
}

/// Cleans up a configured domain, and rejects the shapes that look like a
/// mistake.
///
/// People reach for a URL here, and `https://host/` would silently produce
/// `https://https://host//…` in the OAuth client metadata, which fails in a
/// way that is very hard to read. So a scheme, a path or a stray slash is
/// stripped and reported rather than accepted.
fn normalize_domain(raw: Option<&str>) -> Option<String> {
    let raw = raw.map(str::trim).filter(|value| !value.is_empty())?;

    let mut domain = raw;
    for scheme in ["https://", "http://"] {
        domain = domain.strip_prefix(scheme).unwrap_or(domain);
    }
    // Take the host and drop any path, then any trailing slash.
    domain = domain.split('/').next().unwrap_or(domain).trim();

    if domain.is_empty() {
        tracing::warn!(configured = raw, "ignoring an unusable domain");
        return None;
    }

    let domain = domain.to_ascii_lowercase();
    // Warned once, with the value actually adopted — reporting an
    // intermediate would send someone looking for the wrong string.
    if domain != raw {
        tracing::warn!(
            configured = raw,
            "the domain should be a bare hostname; using {domain}"
        );
    }
    Some(domain)
}

/// SQLite URL for a file inside the data dir. `mode=rwc` so the file is created
/// on first connect instead of erroring, which is the whole point of this crate.
fn sqlite_url(dir: &Path, file: &str) -> String {
    format!("sqlite://{}?mode=rwc", dir.join(file).display())
}

/// Anchors a relative SQLite path to the data directory.
///
/// `sqlite://rocksky.db` in a config file would otherwise land wherever the
/// process happened to be started from — so the database moves when the
/// working directory does, and `--data-dir` looks as though it were ignored.
/// Absolute paths, `:memory:` and every non-SQLite URL are returned untouched.
fn anchor_sqlite_url(url: String, data_dir: &Path) -> String {
    let Some(rest) = url
        .strip_prefix("sqlite://")
        .or_else(|| url.strip_prefix("sqlite:"))
    else {
        return url;
    };

    let (path, query) = match rest.split_once('?') {
        Some((path, query)) => (path, Some(query)),
        None => (rest, None),
    };

    if path.is_empty() || path.starts_with('/') || path.starts_with(":memory:") {
        return url;
    }

    let anchored = data_dir.join(path);
    match query {
        Some(query) => format!("sqlite://{}?{query}", anchored.display()),
        // A path given without flags still needs `rwc`, or sqlx refuses to
        // create the file on first boot.
        None => format!("sqlite://{}?mode=rwc", anchored.display()),
    }
}

/// Reads `<data_dir>/jwt.secret`, generating a 32-byte random key on first run.
/// Tokens minted by a previous boot therefore keep verifying across restarts —
/// a fresh random secret every start would silently log everyone out.
fn load_or_create_secret(data_dir: &Path) -> Result<String, ConfigError> {
    load_or_create_key(data_dir, "jwt.secret")
}

/// Reads `<data_dir>/storage.key`, generating one on first run.
///
/// Must also be stable: it decrypts credentials written by earlier boots, and
/// a new key makes them unreadable rather than merely invalid.
fn load_or_create_storage_key(data_dir: &Path) -> Result<String, ConfigError> {
    load_or_create_key(data_dir, "storage.key")
}

/// Reads a persisted 32-byte hex key, generating it on first run.
fn load_or_create_key(data_dir: &Path, filename: &str) -> Result<String, ConfigError> {
    use rand::RngCore;

    let path = data_dir.join(filename);
    match std::fs::read_to_string(&path) {
        Ok(existing) if !existing.trim().is_empty() => return Ok(existing.trim().to_string()),
        Ok(_) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(source) => return Err(ConfigError::Secret { path, source }),
    }

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let secret = hex::encode(bytes);

    write_secret(&path, &secret).map_err(|source| ConfigError::Secret {
        path: path.clone(),
        source,
    })?;
    tracing::info!(path = %path.display(), "generated a new key");
    Ok(secret)
}

#[cfg(unix)]
fn write_secret(path: &Path, secret: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    // 0600: the key authenticates every API call, so it must not be
    // world-readable on a shared box.
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(secret.as_bytes())
}

#[cfg(not(unix))]
fn write_secret(path: &Path, secret: &str) -> std::io::Result<()> {
    std::fs::write(path, secret)
}

impl S3Config {
    /// Builds the storage config, or `None` when it is not fully specified.
    ///
    /// A partially configured bucket is treated as "not configured" and logged
    /// about: failing at startup would take down an instance that only wanted
    /// scrobbling, and silently accepting it would fail every upload at
    /// runtime with a confusing error instead.
    fn resolve(file: &settings::Storage) -> Option<Self> {
        Self::from_parts(Parts {
            endpoint: pick(None, "S3_ENDPOINT", file.s3_endpoint.clone()),
            region: pick(None, "S3_REGION", file.s3_region.clone()),
            access_key_id: pick(None, "S3_ACCESS_KEY_ID", file.s3_access_key_id.clone()),
            secret_access_key: pick(
                None,
                "S3_SECRET_ACCESS_KEY",
                file.s3_secret_access_key.clone(),
            ),
            bucket: pick(None, "S3_BUCKET_NAME", file.s3_bucket.clone()),
            covers_bucket: pick(None, "S3_COVERS_BUCKET_NAME", file.s3_covers_bucket.clone()),
        })
    }

    /// The pure half of [`S3Config::resolve`]: given already-resolved values,
    /// decide whether storage is usable. Separate so it is testable without
    /// depending on the ambient environment.
    fn from_parts(parts: Parts) -> Option<Self> {
        let Parts {
            endpoint,
            region,
            access_key_id,
            secret_access_key,
            bucket,
            covers_bucket,
        } = parts;

        let required = [
            ("endpoint", &endpoint),
            ("access key id", &access_key_id),
            ("secret access key", &secret_access_key),
            ("bucket", &bucket),
        ];
        let missing: Vec<&str> = required
            .iter()
            .filter(|(_, value)| value.is_none())
            .map(|(name, _)| *name)
            .collect();

        if !missing.is_empty() {
            // Only worth a warning if something was configured: a half-set
            // bucket fails every upload at runtime, whereas nothing set at all
            // is the ordinary "I only wanted scrobbling" case.
            if missing.len() < required.len() {
                tracing::warn!(
                    missing = missing.join(", "),
                    "object storage is partly configured; uploads are disabled"
                );
            }
            return None;
        }

        Some(Self {
            endpoint: endpoint?,
            region: region.unwrap_or_else(|| "auto".to_string()),
            access_key_id: access_key_id?,
            secret_access_key: secret_access_key?,
            bucket: bucket?,
            // The TypeScript API defaults the covers bucket separately from
            // the media bucket.
            covers_bucket: covers_bucket.unwrap_or_else(|| "rocksky".to_string()),
        })
    }
}

/// Resolved-but-unvalidated storage values, the input to
/// [`S3Config::from_parts`].
struct Parts {
    endpoint: Option<String>,
    region: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
    bucket: Option<String>,
    covers_bucket: Option<String>,
}

impl Config {
    /// Resolves the configuration, creating whatever is missing. `.env` is
    /// loaded first when present so running from the repo root behaves like the
    /// TypeScript API's `bun dev`.
    /// Where the data directory and the config file will be, without reading
    /// or creating either.
    ///
    /// `--generate-config` needs these before there is a `Config` to ask, and
    /// it has to agree with [`Config::load`] exactly — writing a file the next
    /// boot would not read is the one way this command can quietly fail.
    pub fn paths(cli: &Cli) -> (PathBuf, PathBuf) {
        let _ = dotenv::dotenv();

        let data_dir = default_data_dir(cli.data_dir.clone());
        let config_path = cli
            .config
            .clone()
            .or_else(|| env_opt("ROCKSKY_CONFIG").map(PathBuf::from))
            .unwrap_or_else(|| data_dir.join("config.toml"));
        (data_dir, config_path)
    }

    pub fn load(cli: Cli) -> Result<Self, ConfigError> {
        let _ = dotenv::dotenv();

        let data_dir = default_data_dir(cli.data_dir.clone());
        std::fs::create_dir_all(&data_dir).map_err(|source| ConfigError::DataDir {
            path: data_dir.clone(),
            source,
        })?;

        let config_path = cli
            .config
            .clone()
            .or_else(|| env_opt("ROCKSKY_CONFIG").map(PathBuf::from))
            .unwrap_or_else(|| data_dir.join("config.toml"));

        // Only auto-create the file at its default location: writing to a path
        // the operator named explicitly would be surprising.
        if cli.config.is_none() && env_opt("ROCKSKY_CONFIG").is_none() {
            Settings::write_template_if_absent(&config_path);
        }

        let file = Settings::load(&config_path)?;

        let jwt_secret = match pick(None, "JWT_SECRET", file.server.jwt_secret.clone()) {
            Some(secret) => secret,
            None => load_or_create_secret(&data_dir)?,
        };

        let storage_encryption_key = match pick(
            None,
            "STORAGE_ENCRYPTION_KEY",
            file.storage.encryption_key.clone(),
        ) {
            Some(key) => key,
            None => load_or_create_storage_key(&data_dir)?,
        };

        let domain = normalize_domain(
            pick(cli.domain.clone(), "DOMAIN", file.server.domain.clone()).as_deref(),
        );

        let port = cli
            .port
            .or_else(|| {
                env_opt("PORT")
                    .or_else(|| env_opt("ROCKSKY_XRPC_PORT"))
                    // `server.ts` reads the misspelled ROCKSKY_XPRC_PORT
                    // first; accept it too so an existing deployment keeps
                    // its port.
                    .or_else(|| env_opt("ROCKSKY_XPRC_PORT"))
                    .and_then(|v| v.parse().ok())
            })
            .or(file.server.port)
            .unwrap_or(3004);

        // `XATA_READ_POSTGRES_URL` is the name the production deployment uses,
        // so an existing Doppler environment supplies the replica without
        // being rewritten; `APPVIEW_*` are the generic names a self-hoster
        // would reach for first.
        //
        // The *primary* deliberately reads no `XATA_*` name. This crate's
        // headline promise is that an empty environment boots on SQLite, and
        // `XATA_POSTGRES_URL` is set in this repository's own `.env` — honouring
        // it here would silently move every developer's instance onto Postgres.
        // A Postgres primary is asked for explicitly, with `[database].url`,
        // `APPVIEW_DB_URL` or `--database-url`.
        let read_database_url = pick(None, "APPVIEW_DB_READ_URL", file.database.read_url.clone())
            .or_else(|| env_opt("XATA_READ_POSTGRES_URL"))
            .filter(|url| !url.is_empty());

        let database_url = pick(
            cli.database_url.clone(),
            "APPVIEW_DB_URL",
            file.database.url.clone(),
        )
        .map(|url| anchor_sqlite_url(url, &data_dir))
        .unwrap_or_else(|| sqlite_url(&data_dir, "rocksky.db"));

        // A replica is a replica *of* the primary, so one on Postgres beside a
        // SQLite primary is not a split read — it is writes and reads landing
        // in different databases, and the symptom is reads that cannot see what
        // was just written.
        //
        // Dropped with a warning rather than refused: the usual way to arrive
        // here is an inherited `XATA_READ_POSTGRES_URL` — which this
        // repository's `.env` sets — next to the default SQLite primary, and
        // failing to boot over an environment variable nobody set on purpose
        // would break every developer checkout. Ignoring it leaves a working
        // instance that reads what it writes.
        let read_database_url = read_database_url.filter(|replica| {
            if is_postgres(replica) == is_postgres(&database_url) {
                return true;
            }
            tracing::warn!(
                primary = %redact_url(&database_url),
                replica = %redact_url(replica),
                "ignoring the read replica: it is a different database from the primary, \
                 so reads would not see what was written. Set [database].url and \
                 [database].read_url to the same server to split reads."
            );
            false
        });

        let auth_database_url = pick(None, "APPVIEW_AUTH_DB_URL", file.database.auth_url.clone())
            .map(|url| anchor_sqlite_url(url, &data_dir))
            .unwrap_or_else(|| sqlite_url(&data_dir, "auth.db"));

        Ok(Self {
            host: pick_or(
                cli.host.clone(),
                "HOST",
                file.server.host.clone(),
                "0.0.0.0",
            ),
            port,

            config_path,
            database_url,
            read_database_url,
            auth_database_url,
            data_dir,

            jwt_secret,
            public_url: resolve_public_url(
                cli.public_url.clone(),
                // `ROCKSKY_PUBLIC_URL` first: every other setting here is
                // named that way, and the bare `PUBLIC_URL` is a name other
                // tools use too. Both are read, so neither spelling silently
                // does nothing.
                env_opt("ROCKSKY_PUBLIC_URL").or_else(|| env_opt("PUBLIC_URL")),
                file.server.public_url.clone(),
                domain.as_deref(),
                port,
            ),
            domain,

            upstream_url: pick(
                None,
                "ROCKSKY_UPSTREAM_URL",
                file.server.upstream_url.clone(),
            ),

            cors_origins: env_list("ROCKSKY_CORS_ORIGINS").or(file.server.cors_origins.clone()),

            jetstream_urls: env_list("JETSTREAM_URLS")
                .or(file.indexer.jetstream_urls.clone())
                .unwrap_or_else(|| {
                    DEFAULT_JETSTREAM_URLS
                        .iter()
                        .map(|url| url.to_string())
                        .collect()
                }),
            indexer_dids: env_list("ROCKSKY_INDEXER_DIDS")
                .or(file.indexer.dids.clone())
                .unwrap_or_default(),
            indexer_enabled: if cli.no_indexer {
                false
            } else {
                env_flag("ROCKSKY_INDEXER")
                    .or(file.indexer.enabled)
                    .unwrap_or(true)
            },
            repair_uris: env_flag("ROCKSKY_REPAIR_URIS")
                .or(file.indexer.repair_uris)
                .unwrap_or(true),
            search_backfill: env_flag("ROCKSKY_SEARCH_BACKFILL")
                .or(file.search.backfill)
                .unwrap_or(true),

            tap_hostname: pick(None, "TAP_HOSTNAME", file.tap.hostname.clone()),
            tap_admin_password: pick(None, "TAP_ADMIN_PASSWORD", file.tap.admin_password.clone()),
            // Enabled implicitly by configuring a hostname, so the common case
            // is one line of config.
            tap_enabled: env_flag("TAP_ENABLED").or(file.tap.enabled).unwrap_or(true)
                && pick(None, "TAP_HOSTNAME", file.tap.hostname.clone()).is_some(),
            tap_repos: env_list("TAP_REPOS")
                .or(file.tap.repos.clone())
                .unwrap_or_default(),

            backfill_dids: env_list("ROCKSKY_BACKFILL_DIDS")
                .or(file.backfill.dids.clone())
                .unwrap_or_default(),
            backfill_on_start: env_flag("ROCKSKY_BACKFILL_ON_START")
                .or(file.backfill.on_start)
                .unwrap_or(false),

            artist_metadata_url: pick_or(
                None,
                "ROCKSKY_ARTIST_METADATA_URL",
                file.services.artist_metadata_url.clone(),
                crate::enrich::DEFAULT_SOURCE,
            ),

            feed_publisher_did: pick_or(
                None,
                "ROCKSKY_FEED_PUBLISHER_DID",
                file.atproto.feed_publisher_did.clone(),
                DEFAULT_FEED_PUBLISHER_DID,
            ),

            plc_directory_url: pick_or(
                None,
                "PLC_DIRECTORY_URL",
                file.atproto.plc_directory_url.clone(),
                "https://plc.directory",
            ),
            bsky_appview_url: pick_or(
                None,
                "BSKY_APPVIEW_URL",
                file.atproto.bsky_appview_url.clone(),
                "https://public.api.bsky.app",
            ),

            redis_url: pick(None, "REDIS_URL", file.cache.redis_url.clone()),
            // Required, so there is a default rather than a `None`: search is
            // the only way to find anything in a large catalogue, and this
            // crate has no substitute for it.
            typesense_url: pick(None, "TYPESENSE_URL", file.search.typesense_url.clone())
                .or_else(|| {
                    // The TypeScript API splits the URL across three variables;
                    // accept that form so an existing .env works unchanged.
                    let host = env_opt("TYPESENSE_HOST")?;
                    let protocol =
                        env_opt("TYPESENSE_PROTOCOL").unwrap_or_else(|| "http".to_string());
                    let port = env_opt("TYPESENSE_PORT").unwrap_or_else(|| "8108".to_string());
                    Some(format!("{protocol}://{host}:{port}"))
                })
                .filter(|url| !url.is_empty())
                .unwrap_or_else(|| DEFAULT_TYPESENSE_URL.to_string()),
            typesense_api_key: pick(
                None,
                "TYPESENSE_API_KEY",
                file.search.typesense_api_key.clone(),
            )
            .filter(|key| !key.is_empty())
            .unwrap_or_else(|| DEFAULT_TYPESENSE_API_KEY.to_string()),
            // Required, so there is a default rather than a `None`: other
            // services communicate through this bus, and an instance that
            // published nowhere would look healthy while half the system
            // stopped.
            nats_url: pick(None, "NATS_URL", file.events.nats_url.clone())
                .filter(|url| !url.is_empty())
                .unwrap_or_else(|| DEFAULT_NATS_URL.to_string()),

            disabled_tealfm: env_list("DISABLED_TEALFM")
                .or(file.tealfm.disabled_dids.clone())
                .unwrap_or_default(),
            tealfm_enabled: env_flag("TEALFM_ENABLED")
                .or(file.tealfm.enabled)
                .unwrap_or(true),

            navidrome_internal_url: pick(
                None,
                "NAVIDROME_INTERNAL_URL",
                file.services.navidrome_url.clone(),
            ),
            navidrome_internal_secret: pick(
                None,
                "NAVIDROME_INTERNAL_SECRET",
                file.services.navidrome_secret.clone(),
            ),
            spotify_api_url: pick(
                None,
                "SPOTIFY_API_URL",
                file.services.spotify_api_url.clone(),
            ),
            spotify_client_id: pick(None, "SPOTIFY_CLIENT_ID", file.spotify.client_id.clone()),
            spotify_client_secret: pick(
                None,
                "SPOTIFY_CLIENT_SECRET",
                file.spotify.client_secret.clone(),
            ),
            spotify_redirect_uri: pick(
                None,
                "SPOTIFY_REDIRECT_URI",
                file.spotify.redirect_uri.clone(),
            ),
            spotify_encryption_key: pick(
                None,
                "SPOTIFY_ENCRYPTION_KEY",
                file.spotify.encryption_key.clone(),
            ),
            spotify_encryption_iv: pick(
                None,
                "SPOTIFY_ENCRYPTION_IV",
                file.spotify.encryption_iv.clone(),
            ),
            spotify_accounts_url: pick(
                None,
                "SPOTIFY_ACCOUNTS_URL",
                file.spotify.accounts_url.clone(),
            )
            .unwrap_or_else(|| DEFAULT_SPOTIFY_ACCOUNTS_URL.to_string()),
            musicbrainz_url: pick(
                None,
                "MUSICBRAINZ_URL",
                file.services.musicbrainz_url.clone(),
            ),
            deezer_url: pick(None, "DEEZER_URL", file.services.deezer_url.clone()),
            drift_url: pick(None, "DRIFT_URL", file.services.drift_url.clone()),
            tracklist_url: pick(None, "TRACKLIST", file.services.tracklist_url.clone()),

            s3: S3Config::resolve(&file.storage),
            storage_encryption_key,

            cdn_url: pick_or(
                None,
                "CDN_URL",
                file.web.cdn_url.clone(),
                "https://cdn.rocksky.app",
            ),
            media_cdn_url: pick_or(
                None,
                "MEDIA_CDN_URL",
                file.web.media_cdn_url.clone(),
                "https://files.rocksky.app",
            ),

            web_api_url: pick(None, "WEB_API_URL", file.web.api_url.clone()),
            web_ws_url: pick(None, "WEB_WS_URL", file.web.ws_url.clone()),
        })
    }

    /// Reads the environment with no command-line overrides.
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::load(Cli::default())
    }

    /// Whether this instance is configured for a public address.
    ///
    /// Binding a routable interface while still calling itself `localhost`
    /// is the classic VPS misconfiguration: the API works, and then OAuth and
    /// every absolute URL point at a machine nobody else can reach.
    pub fn is_public_ready(&self) -> bool {
        self.domain.is_some() || !self.public_url.contains("localhost")
    }

    /// Whether this instance is listening on an address other machines can
    /// reach.
    pub fn is_exposed(&self) -> bool {
        !matches!(self.host.as_str(), "127.0.0.1" | "localhost" | "::1")
    }

    /// The warning to print when a publicly-bound instance has no domain.
    /// `None` when there is nothing to warn about.
    pub fn public_deployment_warning(&self) -> Option<String> {
        (self.is_exposed() && !self.is_public_ready()).then(|| {
            format!(
                "listening on {}:{} but no domain is configured, so this instance \
                 still calls itself {}. Set [server].domain (or ROCKSKY_DOMAIN) to \
                 the hostname it is reached at — OAuth login and absolute URLs \
                 need it.",
                self.host, self.port, self.public_url
            )
        })
    }

    /// A summary safe to log: the signing key is replaced with its length.
    pub fn summary(&self) -> String {
        let backend = if self.database_url.starts_with("postgres") {
            // Whether a replica is configured is worth seeing at startup: a
            // deployment that meant to split reads and did not is otherwise
            // indistinguishable from one that did.
            if self.read_database_url.is_some() {
                "postgres+replica"
            } else {
                "postgres"
            }
        } else {
            "sqlite"
        };
        format!(
            "listen={}:{} domain={} backend={backend} data_dir={} config={} indexer={} \
             repair_uris={} search_backfill={} \
             cache={} search={} events={} uploads={} tap={} backfill={} \
             upstream={} cors={}",
            self.host,
            self.port,
            self.domain.as_deref().unwrap_or("none"),
            self.data_dir.display(),
            self.config_path.display(),
            if self.indexer_enabled { "on" } else { "off" },
            if self.repair_uris { "on" } else { "off" },
            if self.search_backfill { "on" } else { "off" },
            if self.redis_url.is_some() {
                "redis"
            } else {
                "in-process"
            },
            self.typesense_url,
            self.nats_url,
            if self.s3.is_some() { "on" } else { "off" },
            match (&self.tap_hostname, self.tap_enabled) {
                (Some(host), true) => host.as_str(),
                _ => "off",
            },
            self.backfill_dids.len(),
            self.upstream_url.as_deref().unwrap_or("none"),
            match &self.cors_origins {
                Some(origins) => origins.join(","),
                None => "any".to_string(),
            },
        )
    }

    /// A config suitable for tests: in-memory SQLite, fixed secret, no upstream
    /// and no companion services.
    pub fn for_test() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 0,
            domain: None,
            data_dir: PathBuf::from("."),
            config_path: PathBuf::from("config.toml"),
            database_url: "sqlite::memory:".into(),
            read_database_url: None,
            auth_database_url: "sqlite::memory:".into(),
            jwt_secret: "test-secret".into(),
            public_url: "http://localhost".into(),
            upstream_url: None,
            cors_origins: None,
            jetstream_urls: Vec::new(),
            indexer_dids: Vec::new(),
            indexer_enabled: false,
            repair_uris: true,
            search_backfill: true,
            tap_hostname: None,
            tap_admin_password: None,
            tap_enabled: false,
            tap_repos: Vec::new(),
            backfill_dids: Vec::new(),
            backfill_on_start: false,
            artist_metadata_url: crate::enrich::DEFAULT_SOURCE.into(),
            feed_publisher_did: DEFAULT_FEED_PUBLISHER_DID.into(),
            plc_directory_url: "https://plc.directory".into(),
            bsky_appview_url: "https://public.api.bsky.app".into(),
            redis_url: None,
            typesense_url: DEFAULT_TYPESENSE_URL.to_string(),
            typesense_api_key: DEFAULT_TYPESENSE_API_KEY.to_string(),
            nats_url: DEFAULT_NATS_URL.to_string(),
            disabled_tealfm: Vec::new(),
            tealfm_enabled: true,
            navidrome_internal_url: None,
            navidrome_internal_secret: None,
            spotify_api_url: None,
            spotify_client_id: None,
            spotify_client_secret: None,
            spotify_redirect_uri: None,
            spotify_encryption_key: None,
            spotify_encryption_iv: None,
            spotify_accounts_url: DEFAULT_SPOTIFY_ACCOUNTS_URL.to_string(),
            musicbrainz_url: None,
            deezer_url: None,
            drift_url: None,
            tracklist_url: None,
            s3: None,
            storage_encryption_key:
                "0000000000000000000000000000000000000000000000000000000000000001".into(),
            cdn_url: "https://cdn.rocksky.app".into(),
            media_cdn_url: "https://files.rocksky.app".into(),
            web_api_url: None,
            web_ws_url: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_is_stable_across_boots() {
        let dir = tempfile::tempdir().unwrap();
        let first = load_or_create_secret(dir.path()).unwrap();
        let second = load_or_create_secret(dir.path()).unwrap();
        assert_eq!(first, second, "a restart must not invalidate live tokens");
        assert_eq!(first.len(), 64, "32 random bytes, hex encoded");
    }

    /// Both keys must persist, and must not be the same value: the signing
    /// key authenticates requests while the storage key decrypts credentials,
    /// so reusing one for the other widens the blast radius of a leak.
    #[test]
    fn the_signing_and_storage_keys_are_separate_and_stable() {
        let dir = tempfile::tempdir().unwrap();

        let jwt = load_or_create_secret(dir.path()).unwrap();
        let storage = load_or_create_storage_key(dir.path()).unwrap();

        assert_ne!(jwt, storage);
        assert_eq!(jwt.len(), 64);
        assert_eq!(storage.len(), 64, "32 bytes of hex, as secretbox wants");

        // Stable across boots: a new storage key would make every stored
        // credential undecryptable rather than merely invalid.
        assert_eq!(load_or_create_secret(dir.path()).unwrap(), jwt);
        assert_eq!(load_or_create_storage_key(dir.path()).unwrap(), storage);

        assert!(dir.path().join("jwt.secret").exists());
        assert!(dir.path().join("storage.key").exists());
    }

    /// And the generated storage key must actually work with the crypto that
    /// consumes it.
    #[test]
    fn the_generated_storage_key_can_encrypt_and_decrypt() {
        let dir = tempfile::tempdir().unwrap();
        let key = load_or_create_storage_key(dir.path()).unwrap();

        let encrypted = crate::crypto::encrypt_credential(&key, "a token").unwrap();
        assert_eq!(
            crate::crypto::decrypt_credential(&key, &encrypted).unwrap(),
            "a token"
        );
    }

    #[test]
    fn sqlite_urls_create_missing_files() {
        let url = sqlite_url(Path::new("/tmp/rocksky"), "rocksky.db");
        assert_eq!(url, "sqlite:///tmp/rocksky/rocksky.db?mode=rwc");
    }

    #[test]
    fn a_relative_sqlite_path_lands_in_the_data_directory() {
        let dir = Path::new("/var/lib/rocksky");

        // A bare relative path gains both the directory and the create flag.
        assert_eq!(
            anchor_sqlite_url("sqlite://rocksky.db".into(), dir),
            "sqlite:///var/lib/rocksky/rocksky.db?mode=rwc"
        );
        // Existing flags are kept rather than replaced.
        assert_eq!(
            anchor_sqlite_url("sqlite://db/main.db?mode=rwc&cache=shared".into(), dir),
            "sqlite:///var/lib/rocksky/db/main.db?mode=rwc&cache=shared"
        );
        // The short form is accepted too.
        assert_eq!(
            anchor_sqlite_url("sqlite:rocksky.db".into(), dir),
            "sqlite:///var/lib/rocksky/rocksky.db?mode=rwc"
        );
    }

    #[test]
    fn absolute_memory_and_postgres_urls_are_left_alone() {
        let dir = Path::new("/var/lib/rocksky");
        for url in [
            "sqlite:///srv/data/rocksky.db?mode=rwc",
            "sqlite://:memory:",
            "postgres://user:pw@localhost/rocksky",
        ] {
            assert_eq!(anchor_sqlite_url(url.into(), dir), url, "{url}");
        }
    }

    #[test]
    fn flags_read_falsey_strings() {
        env::set_var("ROCKSKY_TEST_FLAG", "off");
        assert_eq!(env_flag("ROCKSKY_TEST_FLAG"), Some(false));
        env::set_var("ROCKSKY_TEST_FLAG", "1");
        assert_eq!(env_flag("ROCKSKY_TEST_FLAG"), Some(true));
        env::remove_var("ROCKSKY_TEST_FLAG");
        assert_eq!(env_flag("ROCKSKY_TEST_FLAG"), None);
    }

    #[test]
    fn lists_split_on_commas_and_drop_blanks() {
        env::set_var("ROCKSKY_TEST_LIST", "a, b ,,c,");
        assert_eq!(
            env_list("ROCKSKY_TEST_LIST"),
            Some(vec!["a".into(), "b".into(), "c".into()])
        );
        env::remove_var("ROCKSKY_TEST_LIST");
        assert_eq!(env_list("ROCKSKY_TEST_LIST"), None);
    }

    #[test]
    fn cli_beats_env_beats_file() {
        env::set_var("ROCKSKY_TEST_PICK", "from-env");
        assert_eq!(
            pick(
                Some("from-cli".into()),
                "ROCKSKY_TEST_PICK",
                Some("from-file".into())
            )
            .as_deref(),
            Some("from-cli")
        );
        assert_eq!(
            pick(None, "ROCKSKY_TEST_PICK", Some("from-file".into())).as_deref(),
            Some("from-env")
        );
        env::remove_var("ROCKSKY_TEST_PICK");
        assert_eq!(
            pick(None, "ROCKSKY_TEST_PICK", Some("from-file".into())).as_deref(),
            Some("from-file")
        );
        assert_eq!(pick(None, "ROCKSKY_TEST_PICK", None), None);
    }

    /// The headline promise: no config file, no environment, still a working
    /// instance. Run in an isolated data dir so it does not touch a real one.
    #[test]
    fn an_empty_environment_yields_a_runnable_config() {
        let dir = tempfile::tempdir().unwrap();
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .expect("must boot with nothing configured");

        assert_eq!(config.port, 3004);
        assert!(
            config.database_url.starts_with("sqlite://"),
            "{}",
            config.database_url
        );
        assert!(config.database_url.contains("mode=rwc"));
        // A key exists either way. Whether it was *generated* depends on the
        // ambient environment, which this test deliberately does not control —
        // `secret_is_stable_across_boots` covers generation on its own.
        assert!(!config.jwt_secret.is_empty(), "requests need a signing key");
        assert!(config.indexer_enabled, "a fresh instance must fill itself");
        assert!(config.upstream_url.is_none(), "nothing to proxy to");
        assert!(config.cors_origins.is_none(), "any origin by default");
        assert!(config.navidrome_internal_url.is_none());

        // And it left behind an editable config file.
        assert!(dir.path().join("config.toml").exists());
    }

    #[test]
    fn the_config_file_is_read() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[server]\nport = 4321\n\n[cache]\nredis_url = \"redis://cfg:6379\"\n",
        )
        .unwrap();

        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .unwrap();

        assert_eq!(config.port, 4321);
        assert_eq!(config.redis_url.as_deref(), Some("redis://cfg:6379"));
        // public_url defaults off the resolved port, not the built-in one.
        assert_eq!(config.public_url, "http://localhost:4321");
    }

    #[test]
    fn a_cli_flag_overrides_the_config_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("config.toml"), "[server]\nport = 4321\n").unwrap();

        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            port: Some(5555),
            no_indexer: true,
            ..Default::default()
        })
        .unwrap();

        assert_eq!(config.port, 5555);
        assert!(!config.indexer_enabled);
    }

    /// Both halves of a split-read Postgres come from the config file.
    #[test]
    fn a_primary_and_a_read_replica_are_both_read_from_the_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[database]\n\
             url = \"postgres://user:pw@primary/rocksky\"\n\
             read_url = \"postgres://user:pw@replica/rocksky\"\n",
        )
        .unwrap();

        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .unwrap();

        assert_eq!(config.database_url, "postgres://user:pw@primary/rocksky");
        assert_eq!(
            config.read_database_url.as_deref(),
            Some("postgres://user:pw@replica/rocksky")
        );
        // And the startup line says a replica is in use, which is otherwise
        // indistinguishable from a deployment that meant to split reads and
        // did not.
        assert!(config.summary().contains("backend=postgres+replica"));
    }

    /// A replica has to be a replica *of* the primary.
    ///
    /// A Postgres replica beside a SQLite primary is not a split read: writes
    /// and reads land in different databases, and the symptom — reads that
    /// cannot see what was just written — reads as a caching bug. Reachable
    /// without anybody meaning it, because this repository's `.env` sets
    /// `XATA_READ_POSTGRES_URL` while the primary defaults to SQLite.
    #[test]
    fn a_replica_on_a_different_backend_is_dropped_rather_than_used() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[database]\n\
             url = \"sqlite://rocksky.db?mode=rwc\"\n\
             read_url = \"postgres://user:secret@replica/rocksky\"\n",
        )
        .unwrap();

        // Still boots: refusing over an environment variable nobody set on
        // purpose would break every developer checkout.
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .expect("a mismatched replica must not stop the instance");

        assert!(config.database_url.starts_with("sqlite://"));
        assert_eq!(
            config.read_database_url, None,
            "the replica must be dropped, not used for reads"
        );
    }

    /// A matching pair is kept, and the startup line says so.
    #[test]
    fn a_matching_replica_is_kept_and_reported() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[database]\n\
             url = \"postgres://user:pw@primary/rocksky\"\n\
             read_url = \"postgres://user:pw@replica/rocksky\"\n",
        )
        .unwrap();

        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .unwrap();

        assert_eq!(
            config.read_database_url.as_deref(),
            Some("postgres://user:pw@replica/rocksky")
        );
        assert!(config.summary().contains("backend=postgres+replica"));
    }

    #[test]
    fn a_url_is_redacted_without_losing_the_host() {
        assert_eq!(
            redact_url("postgres://alice:hunter2@db.example/rocksky"),
            "postgres://alice:***@db.example/rocksky"
        );
        // Nothing to redact, and nothing lost.
        assert_eq!(
            redact_url("postgres://db.example/rocksky"),
            "postgres://db.example/rocksky"
        );
        assert_eq!(redact_url("sqlite://rocksky.db"), "sqlite://rocksky.db");
    }

    /// Both startup batch jobs are on by default and switchable off.
    ///
    /// They exist for a database that has never been indexed or repaired, and
    /// both cost a full scan to decide they have nothing to do — which on a
    /// large remote Postgres is tens of seconds of every boot.
    #[test]
    fn the_startup_batch_jobs_can_be_turned_off() {
        let dir = tempfile::tempdir().unwrap();
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .unwrap();
        assert!(config.repair_uris, "on by default");
        assert!(config.search_backfill, "on by default");

        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[indexer]\nrepair_uris = false\n\n[search]\nbackfill = false\n",
        )
        .unwrap();
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .unwrap();
        assert!(!config.repair_uris);
        assert!(!config.search_backfill);
        // And the startup line says so, since a job silently not running is
        // indistinguishable from one that ran and found nothing.
        let summary = config.summary();
        assert!(summary.contains("repair_uris=off"), "{summary}");
        assert!(summary.contains("search_backfill=off"), "{summary}");
    }

    #[test]
    fn a_postgres_url_is_carried_through() {
        let dir = tempfile::tempdir().unwrap();
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            database_url: Some("postgres://localhost/rocksky".into()),
            ..Default::default()
        })
        .unwrap();

        assert_eq!(config.database_url, "postgres://localhost/rocksky");
        // The session database stays SQLite regardless.
        assert!(config.auth_database_url.starts_with("sqlite://"));
        assert!(config.summary().contains("backend=postgres"));
    }

    #[test]
    fn a_broken_config_file_fails_loudly() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("config.toml"), "[server]\nprot = 1\n").unwrap();

        let err = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .expect_err("a typo'd key must not be silently ignored");
        assert!(matches!(err, ConfigError::Settings(_)), "{err:?}");
    }

    #[test]
    fn a_domain_is_normalized_from_whatever_was_pasted_in() {
        // The hostname form is what we want.
        assert_eq!(
            normalize_domain(Some("rocksky.example.com")).as_deref(),
            Some("rocksky.example.com")
        );
        // A URL is the obvious thing to paste, and silently accepting it would
        // produce "https://https://host/" in the client metadata.
        for pasted in [
            "https://rocksky.example.com",
            "http://rocksky.example.com",
            "https://rocksky.example.com/",
            "rocksky.example.com/",
            "https://rocksky.example.com/callback",
            "  rocksky.example.com  ",
            "Rocksky.Example.COM",
        ] {
            assert_eq!(
                normalize_domain(Some(pasted)).as_deref(),
                Some("rocksky.example.com"),
                "{pasted}"
            );
        }

        assert_eq!(normalize_domain(None), None);
        assert_eq!(normalize_domain(Some("")), None);
        assert_eq!(normalize_domain(Some("   ")), None);
        assert_eq!(normalize_domain(Some("https://")), None);
    }

    #[test]
    fn a_domain_implies_an_https_public_url() {
        let dir = tempfile::tempdir().unwrap();
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            domain: Some("rocksky.example.com".into()),
            ..Default::default()
        })
        .unwrap();

        assert_eq!(config.domain.as_deref(), Some("rocksky.example.com"));
        assert_eq!(config.public_url, "https://rocksky.example.com");
        assert!(config.is_public_ready());
        assert!(config.summary().contains("domain=rocksky.example.com"));
    }

    /// Both spellings of the environment variable are read. `compose.yml`
    /// documents `ROCKSKY_PUBLIC_URL`, matching every other setting; only
    /// `PUBLIC_URL` used to be read, so following the documentation had no
    /// effect at all.
    #[test]
    fn the_public_url_falls_back_in_order() {
        let env = || Some("https://from-env.example".to_string());
        let file = || Some("https://from-file.example".to_string());

        assert_eq!(
            resolve_public_url(
                Some("https://cli.example".into()),
                env(),
                file(),
                Some("d"),
                80
            ),
            "https://cli.example"
        );
        assert_eq!(
            resolve_public_url(None, env(), file(), Some("d"), 80),
            "https://from-env.example"
        );
        assert_eq!(
            resolve_public_url(None, None, file(), Some("d"), 80),
            "https://from-file.example"
        );
        // A domain alone implies https.
        assert_eq!(
            resolve_public_url(None, None, None, Some("rocksky.example.com"), 80),
            "https://rocksky.example.com"
        );
        // And with nothing set, the resolved port — not the built-in one.
        assert_eq!(
            resolve_public_url(None, None, None, None, 4321),
            "http://localhost:4321"
        );
    }

    #[test]
    fn an_explicit_public_url_still_wins_over_the_domain() {
        let dir = tempfile::tempdir().unwrap();
        // Behind a proxy on a non-standard port, or plain http on a LAN.
        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            domain: Some("rocksky.example.com".into()),
            public_url: Some("http://rocksky.example.com:8080".into()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(config.public_url, "http://rocksky.example.com:8080");
        assert_eq!(config.domain.as_deref(), Some("rocksky.example.com"));
    }

    #[test]
    fn the_domain_can_come_from_the_config_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "[server]\ndomain = \"rocksky.example.com\"\n",
        )
        .unwrap();

        let config = Config::load(Cli {
            data_dir: Some(dir.path().to_path_buf()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(config.public_url, "https://rocksky.example.com");
    }

    /// The failure this is here to prevent: a VPS deployment that works until
    /// someone tries to log in.
    #[test]
    fn a_publicly_bound_instance_without_a_domain_is_warned_about() {
        let mut config = Config::for_test();
        config.host = "0.0.0.0".into();
        config.public_url = "http://localhost:3004".into();
        config.domain = None;

        let warning = config
            .public_deployment_warning()
            .expect("this is the misconfiguration to catch");
        assert!(warning.contains("domain"), "{warning}");
        assert!(warning.contains("0.0.0.0"), "{warning}");

        // With a domain, nothing to say.
        config.domain = Some("rocksky.example.com".into());
        config.public_url = "https://rocksky.example.com".into();
        assert!(config.public_deployment_warning().is_none());
    }

    #[test]
    fn a_loopback_instance_is_not_warned_about() {
        let mut config = Config::for_test();
        config.host = "127.0.0.1".into();
        config.public_url = "http://localhost:3004".into();
        assert!(!config.is_exposed());
        assert!(
            config.public_deployment_warning().is_none(),
            "running on a laptop is the normal case, not a misconfiguration"
        );
    }

    #[test]
    fn the_summary_never_contains_the_signing_key() {
        let config = Config::for_test();
        assert!(!config.summary().contains(&config.jwt_secret));
    }

    fn storage_parts() -> Parts {
        Parts {
            endpoint: Some("https://example.r2.cloudflarestorage.com".into()),
            region: None,
            access_key_id: Some("key".into()),
            secret_access_key: Some("secret".into()),
            bucket: Some("rocksky-library".into()),
            covers_bucket: None,
        }
    }

    #[test]
    fn fully_specified_storage_resolves_with_defaults_filled_in() {
        let s3 = S3Config::from_parts(storage_parts()).expect("must resolve");
        assert_eq!(s3.endpoint, "https://example.r2.cloudflarestorage.com");
        assert_eq!(s3.bucket, "rocksky-library");
        assert_eq!(s3.region, "auto", "the default region");
        assert_eq!(s3.covers_bucket, "rocksky", "the default covers bucket");
    }

    #[test]
    fn partly_configured_storage_disables_uploads_rather_than_failing() {
        // A bucket with no credentials would fail every upload at runtime;
        // reporting it as unavailable up front is the honest state.
        for missing in ["endpoint", "access_key_id", "secret_access_key", "bucket"] {
            let mut parts = storage_parts();
            match missing {
                "endpoint" => parts.endpoint = None,
                "access_key_id" => parts.access_key_id = None,
                "secret_access_key" => parts.secret_access_key = None,
                _ => parts.bucket = None,
            }
            assert!(
                S3Config::from_parts(parts).is_none(),
                "storage without {missing} must not resolve"
            );
        }
    }

    #[test]
    fn no_storage_configuration_at_all_is_simply_off() {
        let none = S3Config::from_parts(Parts {
            endpoint: None,
            region: None,
            access_key_id: None,
            secret_access_key: None,
            bucket: None,
            covers_bucket: None,
        });
        assert!(none.is_none());

        let config = Config::for_test();
        assert!(config.s3.is_none());
        assert!(config.summary().contains("uploads=off"));
    }
}
