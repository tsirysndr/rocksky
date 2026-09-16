//! Object storage: the managed bucket and per-user bring-your-own ones.
//!
//! Every upload resolves to one of two targets, and which one is decided by a
//! single nullable column:
//!
//! | `user_uploads.storage_provider_id` | target                                     |
//! |------------------------------------|--------------------------------------------|
//! | `NULL`                             | the instance's own bucket (`[storage]` config) |
//! | a `user_storage_providers` id      | that user's own bucket                     |
//!
//! The `NULL` path must keep working untouched — bring-your-own storage is
//! purely additive, and an existing library is full of rows that have it.
//!
//! The client crate and conventions match `crates/navidrome/src/s3.rs`
//! (`rust-s3`, `Region::Custom`, path-style addressing) so a presigned URL
//! minted here and one minted there address the same object.

pub mod providers;

use crate::config::S3Config;
use crate::crypto;
use crate::db::{models, Backend};
use s3::creds::Credentials;
use s3::region::Region;
use s3::Bucket;

/// A resolved bucket, ready to read or write.
///
/// `Debug` omits the bucket, whose credentials would otherwise be printable.
pub struct StorageTarget {
    pub bucket: Box<Bucket>,
    /// The row id to record on an upload, or `None` for managed storage.
    pub provider_id: Option<String>,
    /// Base URL for public object links, when the provider has one.
    pub public_url: Option<String>,
}

impl std::fmt::Debug for StorageTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StorageTarget")
            .field("bucket", &self.bucket.name())
            .field("provider_id", &self.provider_id)
            .field("public_url", &self.public_url)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("object storage is not configured on this instance")]
    NotConfigured,
    #[error("storage provider {0} not found for this account")]
    ProviderNotFound(String),
    #[error("the stored credentials for provider {provider} could not be read: {source}")]
    Credentials {
        provider: String,
        #[source]
        source: crypto::CryptoError,
    },
    #[error(transparent)]
    S3(#[from] s3::error::S3Error),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// Builds a `rust-s3` bucket handle.
///
/// Path style is used throughout: R2 and MinIO both need it, and the managed
/// bucket is addressed the same way by `crates/navidrome`.
fn bucket_for(
    endpoint: &str,
    region: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
) -> Result<Box<Bucket>, s3::error::S3Error> {
    let region = Region::Custom {
        region: region.to_string(),
        endpoint: endpoint.to_string(),
    };
    let credentials = Credentials::new(Some(access_key), Some(secret_key), None, None, None)?;
    Ok(Bucket::new(bucket, region, credentials)?.with_path_style())
}

/// The instance's own bucket.
pub fn managed(config: &S3Config) -> Result<StorageTarget, StorageError> {
    Ok(StorageTarget {
        bucket: bucket_for(
            &config.endpoint,
            &config.region,
            &config.bucket,
            &config.access_key_id,
            &config.secret_access_key,
        )?,
        provider_id: None,
        public_url: None,
    })
}

/// The instance's covers bucket.
///
/// Always the instance's own, never a user's: a cover is shared across every
/// listener of that album, so it does not belong in one person's bucket.
pub fn covers_bucket(config: &S3Config) -> Result<Box<Bucket>, StorageError> {
    Ok(bucket_for(
        &config.endpoint,
        &config.region,
        &config.covers_bucket,
        &config.access_key_id,
        &config.secret_access_key,
    )?)
}

/// Resolves the target for a user, decrypting their credentials when the
/// upload belongs to a bring-your-own provider.
///
/// The provider lookup is scoped to `user_id`, so one account cannot name
/// another's bucket.
pub async fn resolve(
    db: &Backend,
    s3: Option<&S3Config>,
    storage_key: &str,
    user_id: &str,
    provider_id: Option<&str>,
) -> Result<StorageTarget, StorageError> {
    let Some(provider_id) = provider_id else {
        return managed(s3.ok_or(StorageError::NotConfigured)?);
    };

    let provider = providers::find(db, user_id, provider_id)
        .await?
        .ok_or_else(|| StorageError::ProviderNotFound(provider_id.to_string()))?;

    let decrypt = |value: &str| {
        crypto::decrypt_credential(storage_key, value).map_err(|source| StorageError::Credentials {
            provider: provider_id.to_string(),
            source,
        })
    };
    let access_key = decrypt(&provider.access_key)?;
    let secret_key = decrypt(&provider.secret_key)?;

    Ok(StorageTarget {
        bucket: bucket_for(
            &provider.endpoint,
            &provider.region,
            &provider.bucket,
            &access_key,
            &secret_key,
        )?,
        provider_id: Some(provider.id),
        public_url: provider.public_url,
    })
}

/// Why a connectivity probe failed, in terms someone debugging their bucket
/// can act on.
///
/// A bare status code ("UnknownError") tells them nothing, which is the
/// problem the equivalent mapping in `apps/api/src/storage/app.ts` exists to
/// solve. The wording is kept, because it is user-facing.
pub fn describe_failure(err: &s3::error::S3Error) -> String {
    use s3::error::S3Error;

    match err {
        S3Error::HttpFailWithBody(403, _) => "The bucket refused these credentials (403). \
             Check the access key, secret key, and that they have permission on this bucket."
            .to_string(),
        S3Error::HttpFailWithBody(404, _) => "That bucket was not found at that endpoint (404). \
             Check the bucket name and endpoint URL."
            .to_string(),
        S3Error::HttpFailWithBody(301, _) => "The bucket exists but in a different region (301). \
             Set the region this bucket actually lives in."
            .to_string(),
        // A transport failure is a bad endpoint far more often than anything
        // else, so say so rather than surfacing a socket error.
        S3Error::Io(_) | S3Error::Hyper(_) | S3Error::UrlParse(_) => {
            "Could not reach that endpoint. Check the endpoint URL.".to_string()
        }
        S3Error::Credentials(_) => {
            "Those credentials were rejected before any request was made.".to_string()
        }
        S3Error::HttpFailWithBody(status, body) => {
            // Include the body: S3-compatible services put a useful <Message>
            // in it, and hiding it is what makes these undebuggable.
            let body = body.trim();
            if body.is_empty() {
                format!("The bucket answered {status}.")
            } else {
                format!("The bucket answered {status}: {body}")
            }
        }
        other => format!("Failed to connect to the S3 bucket: {other}"),
    }
}

/// Checks that the credentials can actually see the bucket.
///
/// `apps/api` sends `HeadBucket`. `rust-s3`'s `Bucket::exists()` is not the
/// equivalent — it calls **ListBuckets**, which needs account-level
/// permission that a bucket-scoped credential will not have, so it would
/// reject perfectly good credentials. A one-key `ListObjectsV2` needs the same
/// `s3:ListBucket` permission `HeadBucket` does.
pub async fn probe(target: &StorageTarget) -> Result<(), s3::error::S3Error> {
    target
        .bucket
        .list_page(String::new(), None, None, None, Some(1))
        .await
        .map(|_| ())
}

/// A stored provider row.
pub use providers::StorageProvider;

/// Column list for [`StorageProvider`].
pub const PROVIDER_COLS: &[models::Col] = providers::PROVIDER_COLS;

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> S3Config {
        S3Config {
            endpoint: "https://example.r2.cloudflarestorage.com".into(),
            region: "auto".into(),
            access_key_id: "key".into(),
            secret_access_key: "secret".into(),
            bucket: "rocksky-library".into(),
            covers_bucket: "rocksky".into(),
        }
    }

    #[test]
    fn the_managed_target_uses_path_style_addressing() {
        let target = managed(&config()).unwrap();
        assert_eq!(target.bucket.name(), "rocksky-library");
        assert!(
            target.bucket.is_path_style(),
            "R2 and MinIO both require path style, as crates/navidrome does"
        );
        assert!(
            target.provider_id.is_none(),
            "managed storage records NULL, which is the untouched legacy path"
        );
    }

    #[tokio::test]
    async fn no_configuration_means_uploads_are_unavailable_not_a_crash() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let err = resolve(&db, None, "key", "rec_user", None)
            .await
            .expect_err("managed storage needs configuration");
        assert!(matches!(err, StorageError::NotConfigured), "{err:?}");
    }

    #[tokio::test]
    async fn another_users_provider_cannot_be_named() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let err = resolve(
            &db,
            Some(&config()),
            "key",
            "rec_alice",
            Some("rec_bobs_bucket"),
        )
        .await
        .expect_err("must not resolve");
        assert!(matches!(err, StorageError::ProviderNotFound(_)), "{err:?}");
    }

    #[test]
    fn failures_are_described_in_actionable_terms() {
        use s3::error::S3Error;

        let forbidden = describe_failure(&S3Error::HttpFailWithBody(403, String::new()));
        assert!(
            forbidden.contains("refused these credentials"),
            "{forbidden}"
        );
        assert!(forbidden.contains("403"), "{forbidden}");

        let missing = describe_failure(&S3Error::HttpFailWithBody(404, String::new()));
        assert!(missing.contains("not found"), "{missing}");

        let region = describe_failure(&S3Error::HttpFailWithBody(301, String::new()));
        assert!(region.contains("different region"), "{region}");

        // An unmapped status still carries the service's own message, which is
        // usually the only useful part.
        let other = describe_failure(&S3Error::HttpFailWithBody(
            500,
            "<Error><Message>Internal</Message></Error>".into(),
        ));
        assert!(other.contains("500"), "{other}");
        assert!(other.contains("Internal"), "{other}");

        let unreachable = describe_failure(&S3Error::Io(std::io::Error::other("refused")));
        assert!(unreachable.contains("Could not reach"), "{unreachable}");
    }
}
