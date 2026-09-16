//! The `user_storage_providers` table.
//!
//! Rows hold a user's own S3 credentials, encrypted at rest with
//! [`crate::crypto`] — the same format `apps/api` writes, so a provider added
//! through either server is usable by both.

use crate::db::models::{self, Col};
use crate::db::Backend;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A stored provider, with credentials still encrypted.
///
/// The keys are deliberately left encrypted in this struct: decryption happens
/// only where a client is being built, so a provider can be listed or deleted
/// without the plaintext ever existing.
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct StorageProvider {
    pub id: String,
    pub label: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub public_url: Option<String>,
    pub verified_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

pub const PROVIDER_COLS: &[Col] = models::STORAGE_PROVIDER_COLS;

/// Looks up one provider, scoped to its owner.
pub async fn find(
    db: &Backend,
    user_id: &str,
    provider_id: &str,
) -> Result<Option<StorageProvider>, sqlx::Error> {
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(PROVIDER_COLS, db.dialect(), None))
        .push(" FROM user_storage_providers WHERE xata_id = ")
        .bind(provider_id)
        .push(" AND user_id = ")
        .bind(user_id)
        .push(" LIMIT 1");
    db.fetch_optional(&sql).await
}

/// Every provider belonging to a user.
pub async fn list(db: &Backend, user_id: &str) -> Result<Vec<StorageProvider>, sqlx::Error> {
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(PROVIDER_COLS, db.dialect(), None))
        .push(" FROM user_storage_providers WHERE user_id = ")
        .bind(user_id)
        .push(" ORDER BY xata_createdat ASC");
    db.fetch_all(&sql).await
}

/// Whether any upload still points at this provider.
///
/// Deleting a provider with uploads behind it would strand them: the rows
/// would name a bucket whose credentials are gone, and the audio would be
/// unreachable with no way to recover the reference.
pub async fn is_in_use(db: &Backend, provider_id: &str) -> Result<bool, sqlx::Error> {
    let mut sql = db.sql("SELECT xata_id FROM user_uploads WHERE storage_provider_id = ");
    sql.bind(provider_id).push(" LIMIT 1");
    Ok(db.fetch_scalar::<String>(&sql).await?.is_some())
}

/// Deletes a provider, scoped to its owner. Returns whether a row went.
pub async fn delete(db: &Backend, user_id: &str, provider_id: &str) -> Result<bool, sqlx::Error> {
    let mut sql = db.sql("DELETE FROM user_storage_providers WHERE xata_id = ");
    sql.bind(provider_id).push(" AND user_id = ").bind(user_id);
    Ok(db.execute(&sql).await? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn fixture() -> (Backend, String) {
        let backend = db::connect_in_memory().await.unwrap();
        let user_id = crate::ingest::upsert_user(&backend, "did:plc:alice")
            .await
            .unwrap();

        let mut sql = backend.sql(
            "INSERT INTO user_storage_providers \
             (xata_id, user_id, label, endpoint, region, bucket, access_key, secret_key, \
              public_url, verified_at) VALUES (",
        );
        sql.bind("rec_provider")
            .push(", ")
            .bind(&user_id)
            .push(", ")
            .bind("My R2")
            .push(", ")
            .bind("https://example.r2.cloudflarestorage.com")
            .push(", ")
            .bind("auto")
            .push(", ")
            .bind("my-music")
            .push(", ")
            .bind("encrypted-access")
            .push(", ")
            .bind("encrypted-secret")
            .push(", ")
            .bind("https://music.example")
            .push(", ")
            .bind(db::now_timestamp())
            .push(")");
        backend.execute(&sql).await.unwrap();

        (backend, user_id)
    }

    #[tokio::test]
    async fn a_provider_is_found_by_its_owner() {
        let (db, user_id) = fixture().await;
        let provider = find(&db, &user_id, "rec_provider").await.unwrap().unwrap();

        assert_eq!(provider.label, "My R2");
        assert_eq!(provider.bucket, "my-music");
        assert_eq!(
            provider.public_url.as_deref(),
            Some("https://music.example")
        );
        assert!(provider.verified_at.is_some());
        // Still encrypted at this layer.
        assert_eq!(provider.access_key, "encrypted-access");
    }

    #[tokio::test]
    async fn a_provider_is_invisible_to_another_account() {
        let (db, _user_id) = fixture().await;
        let bob = crate::ingest::upsert_user(&db, "did:plc:bob")
            .await
            .unwrap();

        assert!(find(&db, &bob, "rec_provider").await.unwrap().is_none());
        assert!(!delete(&db, &bob, "rec_provider").await.unwrap());
        // And Alice's row is still there.
        assert_eq!(list(&db, &_user_id).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_provider_with_uploads_is_reported_as_in_use() {
        let (db, user_id) = fixture().await;
        assert!(!is_in_use(&db, "rec_provider").await.unwrap());

        // An upload needs a track to point at.
        let mut sql = db.sql(
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256) \
             VALUES (",
        );
        sql.bind("rec_track")
            .push(", ")
            .bind("Roygbiv")
            .push(", ")
            .bind("A")
            .push(", ")
            .bind("A")
            .push(", ")
            .bind("B")
            .push(", ")
            .bind(1i64)
            .push(", ")
            .bind("sha")
            .push(")");
        db.execute(&sql).await.unwrap();

        let mut sql = db.sql(
            "INSERT INTO user_uploads \
             (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename, \
              storage_provider_id) VALUES (",
        );
        sql.bind("rec_upload")
            .push(", ")
            .bind(&user_id)
            .push(", ")
            .bind("rec_track")
            .push(", ")
            .bind("music/a.flac")
            .push(", ")
            .bind("audio/flac")
            .push(", ")
            .bind(100i64)
            .push(", ")
            .bind("a.flac")
            .push(", ")
            .bind("rec_provider")
            .push(")");
        db.execute(&sql).await.unwrap();

        assert!(
            is_in_use(&db, "rec_provider").await.unwrap(),
            "deleting it would strand this upload"
        );
    }

    #[tokio::test]
    async fn a_managed_upload_does_not_hold_a_provider_open() {
        let (db, user_id) = fixture().await;

        let mut sql = db.sql(
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256) \
             VALUES (",
        );
        sql.bind("rec_track")
            .push(", ")
            .bind("T")
            .push(", ")
            .bind("A")
            .push(", ")
            .bind("A")
            .push(", ")
            .bind("B")
            .push(", ")
            .bind(1i64)
            .push(", ")
            .bind("sha")
            .push(")");
        db.execute(&sql).await.unwrap();

        // storage_provider_id NULL — the managed path.
        let mut sql = db.sql(
            "INSERT INTO user_uploads \
             (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename) \
             VALUES (",
        );
        sql.bind("rec_upload")
            .push(", ")
            .bind(&user_id)
            .push(", ")
            .bind("rec_track")
            .push(", ")
            .bind("music/a.flac")
            .push(", ")
            .bind("audio/flac")
            .push(", ")
            .bind(100i64)
            .push(", ")
            .bind("a.flac")
            .push(")");
        db.execute(&sql).await.unwrap();

        assert!(!is_in_use(&db, "rec_provider").await.unwrap());
    }

    #[tokio::test]
    async fn deleting_reports_whether_a_row_went() {
        let (db, user_id) = fixture().await;
        assert!(delete(&db, &user_id, "rec_provider").await.unwrap());
        assert!(!delete(&db, &user_id, "rec_provider").await.unwrap());
        assert!(list(&db, &user_id).await.unwrap().is_empty());
    }
}
