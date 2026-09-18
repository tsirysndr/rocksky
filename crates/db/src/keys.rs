//! The secrets a Rocksky service needs, when nobody told it.
//!
//! [`crate::shared`] lets the music services find the appview's database
//! without being configured. On its own that is not enough to make them work
//! together, because they also have to agree on four secrets:
//!
//! | variable                  | what it is                                |
//! |---------------------------|-------------------------------------------|
//! | `JWT_SECRET`              | signs and verifies the session tokens     |
//! | `STORAGE_ENCRYPTION_KEY`  | decrypts the stored S3 credentials        |
//! | `SPOTIFY_ENCRYPTION_KEY`  | decrypts the stored Spotify tokens        |
//! | `SPOTIFY_ENCRYPTION_IV`   | the IV those tokens were encrypted with   |
//!
//! `rocksky-appview` generates its own `JWT_SECRET` on first boot and keeps it
//! in the data directory, and every service that talks to it has to hold the
//! same one:
//!
//!   * `crates/navidrome` and `crates/jellyfin` *mint* a token per play, to
//!     post `app.rocksky.scrobble.createScrobble`. With a different secret the
//!     appview answers 401, so a play from a Subsonic or Jellyfin client is
//!     logged as a failed publish and dropped: the library works and nothing
//!     scrobbles.
//!   * `crates/scrobbler` and `crates/webscrobbler` *verify* the bearer tokens
//!     they are handed, so a token minted elsewhere in the instance is
//!     rejected.
//!
//! Subsonic *login* is the exception, and does not need this: it compares the
//! password against the `api_keys` rows, so the shared database is enough.
//!
//! The obvious fix is to put a default in `compose.yml`. That is worse than it
//! looks: a well-known signing key lets anyone mint a token for any account on
//! any instance that did not change it, and it would also *override* the random
//! key the appview generates. So instead the secrets are shared the same way
//! the database is — by path, in the data directory, generated once and read by
//! whoever comes next.
//!
//! [`hydrate`] puts them in the environment so the ~60 `env::var` call sites
//! across the services keep working untouched. It runs after `dotenv`, so
//! anything actually configured wins and a deployment that sets these — as the
//! hosted one does — behaves exactly as before.
//!
//! # When this goes wrong
//!
//! The same way the shared database does, and with the same symptom: a service
//! pointed at a *different* data directory than the appview generates its own
//! secrets, and then the tokens it signs are not ones the appview accepts.
//! That is why [`hydrate`] logs the directory it used.

use std::io;
use std::path::{Path, PathBuf};

/// A secret that can be generated when it is absent.
struct Secret {
    /// The variable the services read.
    env: &'static str,
    /// Where it lives in the data directory. `jwt.secret` and `storage.key`
    /// are the names `rocksky-appview` already uses, so it and the services
    /// converge on one file rather than each making their own.
    file: &'static str,
    /// How many random bytes to generate, hex-encoded on the way out.
    bytes: usize,
}

/// Every secret shared between the appview and the music services.
///
/// The AES keys are 32 bytes because the ciphers are AES-256; the IV is 16,
/// the block size. A hex string of the wrong length fails inside the cipher
/// with "Invalid key or IV" rather than anywhere useful, so the lengths are
/// pinned here.
const SECRETS: [Secret; 4] = [
    Secret {
        env: "JWT_SECRET",
        file: "jwt.secret",
        bytes: 32,
    },
    Secret {
        env: "STORAGE_ENCRYPTION_KEY",
        file: "storage.key",
        bytes: 32,
    },
    Secret {
        env: "SPOTIFY_ENCRYPTION_KEY",
        file: "spotify.key",
        bytes: 32,
    },
    Secret {
        env: "SPOTIFY_ENCRYPTION_IV",
        file: "spotify.iv",
        bytes: 16,
    },
];

/// Fills in any of [`SECRETS`] the environment does not already carry.
///
/// Call once, early in `main`, before anything spawns a thread: this sets
/// process-wide environment variables, which is only sound while the process
/// is still single-threaded.
///
/// Never fatal. A data directory that cannot be written is a reason for the
/// services to fall back to the behaviour they had before — reporting the
/// variable as missing at the point it is needed — rather than a reason for a
/// service that does not use S3 or Spotify to refuse to start.
pub fn hydrate() {
    let missing: Vec<&Secret> = SECRETS
        .iter()
        .filter(|secret| env_opt(secret.env).is_none())
        .collect();

    if missing.is_empty() {
        return;
    }

    let dir = crate::shared::default_data_dir();
    if let Err(err) = std::fs::create_dir_all(&dir) {
        tracing::warn!(
            dir = %dir.display(),
            error = ?err,
            "could not create the data directory; shared secrets are unavailable"
        );
        return;
    }

    let mut generated = Vec::new();
    for secret in missing {
        match load_or_create(&dir, secret.file, secret.bytes) {
            Ok(Loaded { value, created }) => {
                if created {
                    generated.push(secret.file);
                }
                std::env::set_var(secret.env, value);
            }
            Err(err) => tracing::warn!(
                file = secret.file,
                error = ?err,
                "could not read or create a shared secret"
            ),
        }
    }

    tracing::info!(
        dir = %dir.display(),
        generated = generated.join(", "),
        "using the shared secrets in the data directory"
    );
}

/// A secret, and whether this process is the one that made it.
struct Loaded {
    value: String,
    created: bool,
}

/// Reads `<dir>/<file>`, generating a random hex key if it is not there.
///
/// Identical in format and location to `rocksky-appview`'s own
/// `load_or_create_key`, because the two have to agree on the bytes.
fn load_or_create(dir: &Path, file: &str, bytes: usize) -> io::Result<Loaded> {
    let path = dir.join(file);

    if let Some(value) = read_if_present(&path)? {
        return Ok(Loaded {
            value,
            created: false,
        });
    }

    let mut buf = vec![0u8; bytes];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut buf);
    let value = hex::encode(&buf);

    // `create_new` rather than `create`: two services starting at once would
    // otherwise both generate, and the loser would hold a secret that is not
    // the one in the file — so the next restart would silently invalidate
    // every token it had issued. Losing the race means reading the winner's.
    match write_new(&path, &value) {
        Ok(()) => Ok(Loaded {
            value,
            created: true,
        }),
        Err(err) if err.kind() == io::ErrorKind::AlreadyExists => match read_if_present(&path)? {
            Some(value) => Ok(Loaded {
                value,
                created: false,
            }),
            // The file is there and holds nothing — a truncated write from an
            // earlier boot, rather than another process winning the race.
            // Overwriting loses nothing, since an empty secret cannot have
            // signed or encrypted anything; refusing would wedge the service
            // on every subsequent start.
            None => {
                overwrite(&path, &value)?;
                Ok(Loaded {
                    value,
                    created: true,
                })
            }
        },
        Err(err) => Err(err),
    }
}

/// The contents of `path`, if it exists and holds something.
///
/// An empty file counts as absent: a half-written secret is not a secret, and
/// treating it as one produces an authentication failure rather than a
/// regenerated key.
fn read_if_present(path: &Path) -> io::Result<Option<String>> {
    match std::fs::read_to_string(path) {
        Ok(contents) => {
            let trimmed = contents.trim();
            Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
        }
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err),
    }
}

#[cfg(unix)]
fn write_new(path: &PathBuf, value: &str) -> io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        // Nobody but the owner: these sign sessions and decrypt credentials.
        .mode(0o600)
        .open(path)?;
    file.write_all(value.as_bytes())
}

#[cfg(not(unix))]
fn write_new(path: &PathBuf, value: &str) -> io::Result<()> {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(value.as_bytes())
}

/// Replaces an existing file's contents. Only for an empty one.
fn overwrite(path: &PathBuf, value: &str) -> io::Result<()> {
    std::fs::write(path, value)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn env_opt(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A generated secret is hex of exactly the declared length, and reading it
    /// back gives the same bytes — the two properties the ciphers depend on.
    #[test]
    fn a_generated_secret_is_stable_and_the_right_length() {
        let dir = tempfile::tempdir().unwrap();

        let first = load_or_create(dir.path(), "jwt.secret", 32).unwrap();
        assert!(first.created);
        assert_eq!(first.value.len(), 64, "32 bytes, hex encoded");
        assert!(hex::decode(&first.value).is_ok());

        let second = load_or_create(dir.path(), "jwt.secret", 32).unwrap();
        assert!(!second.created, "the second read must not regenerate");
        assert_eq!(first.value, second.value);
    }

    /// The IV is shorter than the keys, and the cipher fails unhelpfully if it
    /// is not exactly one block.
    #[test]
    fn the_iv_is_one_aes_block() {
        let dir = tempfile::tempdir().unwrap();
        let iv = load_or_create(dir.path(), "spotify.iv", 16).unwrap();
        assert_eq!(hex::decode(&iv.value).unwrap().len(), 16);
    }

    /// Two secrets in one directory are independent.
    #[test]
    fn different_files_hold_different_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let jwt = load_or_create(dir.path(), "jwt.secret", 32).unwrap();
        let storage = load_or_create(dir.path(), "storage.key", 32).unwrap();
        assert_ne!(jwt.value, storage.value);
    }

    /// A truncated file is regenerated rather than used: an empty "secret"
    /// would be accepted by the JWT library and verify nothing.
    #[test]
    fn an_empty_file_is_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("jwt.secret");
        std::fs::write(&path, "   \n").unwrap();

        let loaded = load_or_create(dir.path(), "jwt.secret", 32).unwrap();
        assert!(!loaded.value.trim().is_empty());
        assert_eq!(loaded.value.len(), 64);
    }

    /// The whole point: a second process pointed at the same directory gets the
    /// *same* signing key, so tokens one issues verify in the other.
    #[test]
    fn a_second_service_in_the_same_directory_agrees() {
        let dir = tempfile::tempdir().unwrap();
        let appview = load_or_create(dir.path(), "jwt.secret", 32).unwrap();
        let subsonic = load_or_create(dir.path(), "jwt.secret", 32).unwrap();
        assert_eq!(appview.value, subsonic.value);
    }

    /// And the documented failure: a different directory means a different key,
    /// which is what makes a mis-mounted volume present as scrobbles that are
    /// published and then 401'd.
    #[test]
    fn a_different_directory_is_a_different_key() {
        let one = tempfile::tempdir().unwrap();
        let two = tempfile::tempdir().unwrap();
        assert_ne!(
            load_or_create(one.path(), "jwt.secret", 32).unwrap().value,
            load_or_create(two.path(), "jwt.secret", 32).unwrap().value
        );
    }

    /// Every secret the services read has a distinct file, and the lengths are
    /// the ones the ciphers require.
    #[test]
    fn the_declared_secrets_are_consistent() {
        let files: std::collections::HashSet<_> = SECRETS.iter().map(|s| s.file).collect();
        assert_eq!(files.len(), SECRETS.len(), "one file per secret");

        for secret in &SECRETS {
            let wanted = if secret.env == "SPOTIFY_ENCRYPTION_IV" {
                16
            } else {
                32
            };
            assert_eq!(secret.bytes, wanted, "{} is the wrong length", secret.env);
        }
    }

    /// `hydrate` leaves a configured secret alone: the hosted deployment sets
    /// these, and overwriting them there would invalidate every live session.
    #[test]
    fn a_configured_secret_is_not_replaced() {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());

        let dir = tempfile::tempdir().unwrap();
        let saved: Vec<_> = SECRETS
            .iter()
            .map(|s| (s.env, std::env::var(s.env).ok()))
            .collect();
        let saved_dir = std::env::var("ROCKSKY_DATA_DIR").ok();

        std::env::set_var("ROCKSKY_DATA_DIR", dir.path());
        for secret in &SECRETS {
            std::env::set_var(secret.env, "configured");
        }

        hydrate();

        for secret in &SECRETS {
            assert_eq!(std::env::var(secret.env).unwrap(), "configured");
            assert!(
                !dir.path().join(secret.file).exists(),
                "{} was generated despite being configured",
                secret.file
            );
        }

        for (key, value) in saved {
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }
        match saved_dir {
            Some(value) => std::env::set_var("ROCKSKY_DATA_DIR", value),
            None => std::env::remove_var("ROCKSKY_DATA_DIR"),
        }
    }
}
