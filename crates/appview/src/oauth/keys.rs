//! The client's signing keyset.
//!
//! A keyset is what makes this a **confidential** OAuth client: with one, the
//! client authenticates to the authorization server with `private_key_jwt`
//! signed by these keys, and publishes the public halves at `/jwks.json`.
//! Without one it is a public client using `token_endpoint_auth_method: none`.
//!
//! That distinction is the reason this module exists rather than the keyset
//! being optional detail: atproto grants **confidential clients much
//! longer-lived refresh tokens**. A public client's sessions lapse in days; a
//! confidential client's keep refreshing, which is what a self-hosted instance
//! needs if its users are not to be asked to sign in again every week.
//!
//! `apps/api` takes its keys from `PRIVATE_KEY_1..3`. Here they are generated
//! on first boot and persisted, so a production deployment is still one line
//! of config (`domain`) rather than a key-generation errand.

use jacquard_oauth::keyset::Keyset;
use std::path::{Path, PathBuf};

/// Filename under the data directory. Holds **private** keys.
const KEYSET_FILE: &str = "oauth-keys.json";

#[derive(Debug, thiserror::Error)]
pub enum KeysetError {
    #[error("cannot read or write {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{path} is not a valid keyset: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("could not generate a signing key: {0}")]
    Generate(String),
}

pub fn keyset_path(data_dir: &Path) -> PathBuf {
    data_dir.join(KEYSET_FILE)
}

/// Loads the keyset, generating and persisting one on first run.
///
/// The keys must be stable across restarts: the authorization server caches
/// the published JWKS, so regenerating them would invalidate every live
/// session's ability to refresh — exactly the thing this is meant to avoid.
pub fn load_or_create(data_dir: &Path) -> Result<Keyset, KeysetError> {
    let path = keyset_path(data_dir);

    match std::fs::read_to_string(&path) {
        Ok(raw) => {
            let keyset: Keyset =
                serde_json::from_str(&raw).map_err(|source| KeysetError::Parse {
                    path: path.clone(),
                    source,
                })?;
            tracing::debug!(path = %path.display(), "loaded the OAuth signing keyset");
            Ok(keyset)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            let keyset = generate()?;
            let json =
                serde_json::to_string_pretty(&keyset).map_err(|source| KeysetError::Parse {
                    path: path.clone(),
                    source,
                })?;
            write_private(&path, &json).map_err(|source| KeysetError::Io {
                path: path.clone(),
                source,
            })?;
            tracing::info!(
                path = %path.display(),
                "generated an OAuth signing keyset; keep this file — losing it \
                 signs every user out"
            );
            Ok(keyset)
        }
        Err(source) => Err(KeysetError::Io { path, source }),
    }
}

/// A single ES256 key.
///
/// One is enough: the keyset only ever *signs* client assertions, so extra
/// keys would be rotation slots rather than added strength. Rotation is
/// possible by appending a new key to the file and removing the old one once
/// the authorization server has refetched the JWKS.
fn generate() -> Result<Keyset, KeysetError> {
    // A fixed `kid` keeps the published JWKS stable across restarts, which is
    // what lets an authorization server keep a cached copy.
    Keyset::generate_es256("rocksky-appview").map_err(|err| KeysetError::Generate(err.to_string()))
}

#[cfg(unix)]
fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;

    // 0600: these are private keys, and a self-hosted box may be shared.
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

    #[test]
    fn a_keyset_is_generated_on_first_run_and_then_reused() {
        let dir = tempfile::tempdir().unwrap();

        let first = load_or_create(dir.path()).expect("must generate");
        assert!(keyset_path(dir.path()).exists());

        let second = load_or_create(dir.path()).expect("must reload");
        // Stability is the whole point: the authorization server caches the
        // published JWKS, so new keys on restart would break every refresh.
        assert_eq!(
            first.public_jwks(),
            second.public_jwks(),
            "the keyset must survive a restart unchanged"
        );
    }

    #[test]
    fn the_published_jwks_has_no_private_material() {
        let dir = tempfile::tempdir().unwrap();
        let keyset = load_or_create(dir.path()).unwrap();

        let public = serde_json::to_value(keyset.public_jwks()).unwrap();
        let serialized = public.to_string();
        assert!(
            !serialized.contains("\"d\""),
            "the private scalar must never be published: {serialized}"
        );
        // But it is still a usable public key.
        assert_eq!(public["keys"][0]["kty"], "EC");
        assert_eq!(public["keys"][0]["crv"], "P-256");
        assert_eq!(public["keys"][0]["kid"], "rocksky-appview");
    }

    #[test]
    fn the_stored_file_does_keep_the_private_half() {
        let dir = tempfile::tempdir().unwrap();
        load_or_create(dir.path()).unwrap();

        let raw = std::fs::read_to_string(keyset_path(dir.path())).unwrap();
        assert!(
            raw.contains("\"d\""),
            "without the private scalar nothing can be signed"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_stored_file_is_not_world_readable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        load_or_create(dir.path()).unwrap();

        let mode = std::fs::metadata(keyset_path(dir.path()))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "private keys must not be readable by others");
    }

    #[test]
    fn a_corrupt_keyset_is_reported_rather_than_silently_replaced() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(keyset_path(dir.path()), "{not json").unwrap();

        // Regenerating here would invalidate live sessions without saying so,
        // so it has to be an error the operator sees.
        let err = load_or_create(dir.path()).expect_err("must not overwrite");
        assert!(matches!(err, KeysetError::Parse { .. }), "{err:?}");
    }
}
