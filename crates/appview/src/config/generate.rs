//! `--generate-config`: a config file with every secret already in it.
//!
//! The instance generates what it needs on first boot anyway — `jwt.secret`,
//! `storage.key` and `oauth-keyset.json` all appear in the data directory
//! without being asked for. This exists for the cases where that is not enough:
//!
//! - **Several instances behind one hostname.** They have to share the signing
//!   key and the storage key, or a token minted by one is rejected by the next
//!   and credentials encrypted by one are unreadable to the other. First-boot
//!   generation gives each its own.
//! - **Deploying from a secret store.** One file to hand to Doppler, `sops` or
//!   a Kubernetes secret beats four.
//! - **The Spotify pair**, which has no first-boot path at all: nothing
//!   generates `[spotify].encryption_key` and `encryption_iv`, so without this
//!   they are two `openssl rand` invocations the reader has to know to run.
//!
//! # Existing secrets are reused, never replaced
//!
//! Run against a data directory that has already booted and this reads the
//! secrets that are there rather than minting new ones. That is the whole
//! safety property: a fresh `jwt.secret` logs every user out, a fresh
//! `storage.key` makes every stored credential unreadable, and a fresh OAuth
//! keyset invalidates every live session's ability to refresh. The command is
//! therefore idempotent, and safe to run against a live instance to collect
//! what it is already using.
//!
//! An existing `config.toml` is never overwritten without `--force`, for the
//! same reason: it may hold secrets nothing else has a copy of.

use super::settings::TEMPLATE;
use std::path::{Path, PathBuf};

/// Where the secrets ended up, for the summary printed afterwards.
///
/// Carries paths and labels only, never a secret value — this is printed to a
/// terminal and would otherwise put the signing key in a scrollback buffer.
#[derive(Debug)]
pub struct Generated {
    pub config_path: PathBuf,
    pub keyset_path: PathBuf,
    /// Secrets read from the data directory rather than minted here.
    pub reused: Vec<&'static str>,
    /// Secrets minted by this run.
    pub created: Vec<&'static str>,
}

#[derive(Debug, thiserror::Error)]
pub enum GenerateError {
    #[error(
        "{0} already exists.\n\
         Refusing to overwrite it: it may hold the only copy of this instance's \
         secrets, and replacing them logs every user out and makes stored \
         credentials unreadable. Pass --force if that is what you want."
    )]
    Exists(PathBuf),

    #[error("could not write {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("could not prepare the OAuth signing keyset: {0}")]
    Keyset(#[from] crate::oauth::keys::KeysetError),

    #[error(
        "the config template has no `{key}` in its [{section}] section, so \
         --generate-config cannot fill it in. The template and this command \
         have to be changed together."
    )]
    TemplateChanged {
        section: &'static str,
        key: &'static str,
    },
}

/// A fresh random key of `bytes` length, hex encoded.
fn random_hex(bytes: usize) -> String {
    use rand::RngCore;

    let mut buffer = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buffer);
    hex::encode(buffer)
}

/// Reads a secret that already exists, or mints one.
///
/// Two places to look, in order: the config being replaced, then the data
/// directory's secret file. The config comes first because a previous run of
/// this command put the value *there* rather than in a file — without that,
/// `--generate-config --force` would mint a new signing key and log everyone
/// out, which is exactly what the module note promises it does not do.
///
/// Nothing is written to the data directory: the generated config is where the
/// value lives, and writing both would leave two sources that can drift.
fn reuse_or_mint(
    existing_config: Option<&str>,
    data_dir: &Path,
    filename: &str,
    label: &'static str,
    bytes: usize,
    reused: &mut Vec<&'static str>,
    created: &mut Vec<&'static str>,
) -> String {
    if let Some(value) = existing_config.map(str::trim).filter(|v| !v.is_empty()) {
        reused.push(label);
        return value.to_string();
    }
    match std::fs::read_to_string(data_dir.join(filename)) {
        Ok(existing) if !existing.trim().is_empty() => {
            reused.push(label);
            existing.trim().to_string()
        }
        _ => {
            created.push(label);
            random_hex(bytes)
        }
    }
}

/// Writes a config with every secret filled in.
pub fn generate(
    data_dir: &Path,
    config_path: &Path,
    force: bool,
) -> Result<Generated, GenerateError> {
    if config_path.exists() && !force {
        return Err(GenerateError::Exists(config_path.to_path_buf()));
    }

    std::fs::create_dir_all(data_dir).map_err(|source| GenerateError::Io {
        path: data_dir.to_path_buf(),
        source,
    })?;

    let mut reused = Vec::new();
    let mut created = Vec::new();

    // Only reachable under `--force`, since otherwise an existing config is
    // refused above. Unreadable is treated as absent: a config too broken to
    // parse has no secrets worth preserving, and failing here would leave no
    // way to regenerate one.
    let previous = super::settings::Settings::load(config_path).unwrap_or_default();

    let jwt_secret = reuse_or_mint(
        previous.server.jwt_secret.as_deref(),
        data_dir,
        "jwt.secret",
        "jwt_secret",
        32,
        &mut reused,
        &mut created,
    );
    let storage_key = reuse_or_mint(
        previous.storage.encryption_key.as_deref(),
        data_dir,
        "storage.key",
        "storage.encryption_key",
        32,
        &mut reused,
        &mut created,
    );
    // No first-boot file for these two, so the config being replaced is the
    // only place a previous value could be.
    let spotify_key = reuse_or_mint(
        previous.spotify.encryption_key.as_deref(),
        data_dir,
        "spotify.key",
        "spotify.encryption_key",
        32,
        &mut reused,
        &mut created,
    );
    let spotify_iv = reuse_or_mint(
        previous.spotify.encryption_iv.as_deref(),
        data_dir,
        "spotify.iv",
        "spotify.encryption_iv",
        16,
        &mut reused,
        &mut created,
    );

    // Stays a file rather than going into the TOML: it is a JWK set, and the
    // OAuth code reads it from `oauth-keyset.json` by name. `load_or_create`
    // leaves an existing one alone, which is what keeps live sessions working.
    let keyset_path = crate::oauth::keys::keyset_path(data_dir);
    let existed = keyset_path.exists();
    crate::oauth::keys::load_or_create(data_dir)?;
    if existed {
        reused.push("oauth keyset");
    } else {
        created.push("oauth keyset");
    }

    let rendered = fill(
        TEMPLATE,
        &[
            ("server", "jwt_secret", &jwt_secret),
            ("storage", "encryption_key", &storage_key),
            ("spotify", "encryption_key", &spotify_key),
            ("spotify", "encryption_iv", &spotify_iv),
        ],
    )?;

    write_private(config_path, &rendered).map_err(|source| GenerateError::Io {
        path: config_path.to_path_buf(),
        source,
    })?;

    Ok(Generated {
        config_path: config_path.to_path_buf(),
        keyset_path,
        reused,
        created,
    })
}

/// Uncomments `# key = ""` inside `[section]` and fills in the value.
///
/// Section-aware because the key alone is ambiguous: `encryption_key` appears
/// under both `[storage]` and `[spotify]`, and they are different secrets for
/// different algorithms — filling the wrong one would produce a config that
/// looks right and cannot decrypt anything.
///
/// Every requested key must be found. A template edit that renames or drops one
/// is a mistake worth failing on rather than quietly emitting a config with a
/// secret missing, which would boot and then behave as though the feature were
/// not configured.
fn fill(
    template: &str,
    values: &[(&'static str, &'static str, &str)],
) -> Result<String, GenerateError> {
    let mut out = String::with_capacity(template.len() + 512);
    let mut section = String::new();
    let mut filled = vec![false; values.len()];

    for line in template.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed.trim_matches(['[', ']']).to_string();
        }

        let mut replaced = None;
        for (index, (wanted_section, key, value)) in values.iter().enumerate() {
            if filled[index] || section != *wanted_section {
                continue;
            }
            // The commented-out form the template carries, e.g. `# jwt_secret = ""`.
            if trimmed == format!("# {key} = \"\"") {
                replaced = Some(format!("{key} = \"{value}\""));
                filled[index] = true;
                break;
            }
        }

        out.push_str(replaced.as_deref().unwrap_or(line));
        out.push('\n');
    }

    if let Some(index) = filled.iter().position(|done| !done) {
        let (section, key, _) = values[index];
        return Err(GenerateError::TemplateChanged { section, key });
    }

    Ok(out)
}

/// 0600: this file now holds the signing key and two encryption keys.
#[cfg(unix)]
fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(contents.as_bytes())
}

#[cfg(not(unix))]
fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    std::fs::write(path, contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generated(dir: &Path) -> String {
        std::fs::read_to_string(dir.join("config.toml")).unwrap()
    }

    #[test]
    fn every_secret_is_filled_in() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        let report = generate(dir.path(), &path, false).unwrap();

        let config = generated(dir.path());
        for key in ["jwt_secret = \"", "encryption_iv = \""] {
            assert!(config.contains(key), "{key} was left commented out");
        }
        // Both `encryption_key`s, one per section.
        assert_eq!(
            config.matches("\nencryption_key = \"").count(),
            2,
            "[storage] and [spotify] each need their own"
        );
        assert!(
            report.keyset_path.exists(),
            "the OAuth keyset was not written"
        );
    }

    /// The generated file has to be a config this binary can actually read.
    #[test]
    fn the_result_parses_as_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        generate(dir.path(), &path, false).unwrap();

        let parsed: crate::config::settings::Settings =
            toml::from_str(&generated(dir.path())).expect("the generated config must parse");
        assert_eq!(parsed.server.jwt_secret.as_deref().map(str::len), Some(64));
        assert_eq!(
            parsed.spotify.encryption_key.as_deref().map(str::len),
            Some(64),
            "32 bytes as hex"
        );
        assert_eq!(
            parsed.spotify.encryption_iv.as_deref().map(str::len),
            Some(32),
            "16 bytes as hex"
        );
        assert_eq!(
            parsed.storage.encryption_key.as_deref().map(str::len),
            Some(64)
        );
    }

    /// The two `encryption_key`s are different secrets and must not be the
    /// same value — the whole reason `fill` is section-aware.
    #[test]
    fn the_storage_and_spotify_keys_are_distinct() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        generate(dir.path(), &path, false).unwrap();

        let parsed: crate::config::settings::Settings =
            toml::from_str(&generated(dir.path())).unwrap();
        assert_ne!(parsed.storage.encryption_key, parsed.spotify.encryption_key);
    }

    /// Running this against a live data directory must not log everyone out.
    #[test]
    fn existing_secrets_are_reused_rather_than_replaced() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("jwt.secret"), "a".repeat(64)).unwrap();
        std::fs::write(dir.path().join("storage.key"), "b".repeat(64)).unwrap();

        let path = dir.path().join("config.toml");
        let report = generate(dir.path(), &path, false).unwrap();

        let config = generated(dir.path());
        assert!(
            config.contains(&format!("jwt_secret = \"{}\"", "a".repeat(64))),
            "a new signing key would invalidate every token already issued"
        );
        assert!(
            config.contains(&format!("encryption_key = \"{}\"", "b".repeat(64))),
            "a new storage key would make stored credentials unreadable"
        );
        assert!(report.reused.contains(&"jwt_secret"));
        assert!(report.reused.contains(&"storage.encryption_key"));
    }

    /// Regenerating over a config this command wrote must not mint new
    /// secrets: they live in that file rather than in the data directory, so
    /// reading only the files would silently replace every one of them.
    #[test]
    fn force_preserves_the_secrets_in_the_config_it_replaces() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        generate(dir.path(), &path, false).unwrap();

        let before: crate::config::settings::Settings =
            toml::from_str(&generated(dir.path())).unwrap();

        let report = generate(dir.path(), &path, true).unwrap();
        let after: crate::config::settings::Settings =
            toml::from_str(&generated(dir.path())).unwrap();

        assert_eq!(
            before.server.jwt_secret, after.server.jwt_secret,
            "a new signing key logs every user out"
        );
        assert_eq!(before.storage.encryption_key, after.storage.encryption_key);
        assert_eq!(before.spotify.encryption_key, after.spotify.encryption_key);
        assert_eq!(before.spotify.encryption_iv, after.spotify.encryption_iv);
        assert!(
            report.created.is_empty(),
            "nothing should have been minted: {:?}",
            report.created
        );
    }

    /// The keyset has to be one `/jwks.json` can actually publish.
    ///
    /// `every_secret_is_filled_in` only proves a file appeared. This proves it
    /// loads, holds a real ES256 key, and yields a public JWKS with no private
    /// scalar in it — the thing `rest::auth::jwks_document` serves and the
    /// authorization server fetches on every login. A generated file that
    /// parsed but published nothing usable would only show up as login
    /// failures against a live PDS.
    #[test]
    fn the_generated_keyset_publishes_a_usable_jwks() {
        let dir = tempfile::tempdir().unwrap();
        generate(dir.path(), &dir.path().join("config.toml"), false).unwrap();

        let keyset = crate::oauth::keys::load_or_create(dir.path()).expect("must reload");
        let published = serde_json::to_value(keyset.public_jwks()).unwrap();

        let keys = published["keys"].as_array().expect("a keys array");
        assert!(!keys.is_empty(), "an empty JWKS authenticates nothing");
        assert_eq!(keys[0]["kty"], "EC");
        assert_eq!(keys[0]["crv"], "P-256", "the alg the metadata advertises");
        assert!(
            keys[0].get("kid").is_some(),
            "the authorization server selects the key by kid"
        );
        assert!(
            !published.to_string().contains("\"d\""),
            "publishing the private scalar would hand out the client's identity: {published}"
        );
    }

    /// The keyset is what live sessions refresh against.
    #[test]
    fn an_existing_keyset_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        generate(dir.path(), &path, false).unwrap();
        let first = std::fs::read_to_string(crate::oauth::keys::keyset_path(dir.path())).unwrap();

        generate(dir.path(), &path, true).unwrap();
        let second = std::fs::read_to_string(crate::oauth::keys::keyset_path(dir.path())).unwrap();

        assert_eq!(first, second, "regenerating it breaks every live session");
    }

    #[test]
    fn an_existing_config_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "# mine\n").unwrap();

        let error = generate(dir.path(), &path, false).unwrap_err();
        assert!(matches!(error, GenerateError::Exists(_)), "{error}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# mine\n");

        generate(dir.path(), &path, true).expect("--force overwrites");
        assert!(std::fs::read_to_string(&path)
            .unwrap()
            .contains("jwt_secret = \""));
    }

    /// Secrets in a world-readable file are not secrets.
    #[cfg(unix)]
    #[test]
    fn the_generated_config_is_not_world_readable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        generate(dir.path(), &path, false).unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0, "group and other must have no access");
    }

    /// A template edit that drops one of these has to fail loudly: a config
    /// silently missing a secret boots and behaves as though the feature were
    /// not configured.
    #[test]
    fn a_template_without_the_key_is_an_error() {
        let error = fill(
            "[server]\n# something_else = \"\"\n",
            &[("server", "jwt_secret", "x")],
        )
        .unwrap_err();
        assert!(
            matches!(
                error,
                GenerateError::TemplateChanged {
                    key: "jwt_secret",
                    ..
                }
            ),
            "{error}"
        );
    }

    /// The same key in the wrong section must not be filled.
    #[test]
    fn filling_is_section_aware() {
        let template = "[storage]\n# encryption_key = \"\"\n[spotify]\n# encryption_key = \"\"\n";
        let filled = fill(
            template,
            &[
                ("storage", "encryption_key", "storage-value"),
                ("spotify", "encryption_key", "spotify-value"),
            ],
        )
        .unwrap();

        let storage = filled.find("storage-value").expect("storage filled");
        let spotify = filled.find("spotify-value").expect("spotify filled");
        assert!(storage < spotify, "each value landed in its own section");
    }
}
