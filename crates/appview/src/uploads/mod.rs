//! Uploaded music: the library rows and the objects behind them.
//!
//! An upload is two things that must stay in step — a `user_uploads` row and
//! an object in a bucket. The row is the authority: it names the key, the
//! bucket (via `storage_provider_id`) and the track it belongs to.
//!
//! What deletion does *not* touch is the important part. `tracks`, `albums`,
//! `artists` and their join tables are shared across users and referenced by
//! scrobble history, so removing an upload leaves them alone: the audio goes,
//! the listening record stays. That is why this is a separate concept from
//! deleting a track.

pub mod audio;
pub mod queue;

use crate::db::models::{self, Col};
use crate::db::Backend;
use crate::storage::{self, StorageError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A `user_uploads` row.
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Upload {
    pub id: String,
    pub user_id: String,
    pub track_id: String,
    /// Object key within the bucket. Named for R2 for historical reasons; it
    /// is just the key on whichever provider the row points at.
    pub r2_key: String,
    pub mime_type: String,
    pub file_size: i64,
    pub original_filename: String,
    pub sample_rate: Option<i64>,
    /// `None` means the instance's own bucket — the managed path, which must
    /// keep working untouched.
    pub storage_provider_id: Option<String>,
    pub uploaded_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub xata_version: Option<i64>,
}

pub const UPLOAD_COLS: &[Col] = models::UPLOAD_COLS;

/// Looks up one upload, scoped to its owner.
pub async fn find(
    db: &Backend,
    user_id: &str,
    upload_id: &str,
) -> Result<Option<Upload>, sqlx::Error> {
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(UPLOAD_COLS, db.dialect(), None))
        .push(" FROM user_uploads WHERE xata_id = ")
        .bind(upload_id)
        .push(" AND user_id = ")
        .bind(user_id)
        .push(" LIMIT 1");
    db.fetch_optional(&sql).await
}

/// How an album was named in the request.
///
/// `GET /uploads`, `DELETE /uploads/album` and the album listing all accept
/// the same two forms, so the parsing lives in one place.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AlbumSelector {
    /// `?albumUri=at://…`
    Uri(String),
    /// `?albumArtist=…&albumName=…`
    ArtistAndName { artist: String, name: String },
}

impl AlbumSelector {
    /// Reads whichever form was supplied, preferring the URI.
    pub fn parse(
        album_uri: Option<&str>,
        album_artist: Option<&str>,
        album_name: Option<&str>,
    ) -> Option<Self> {
        let trimmed = |value: Option<&str>| {
            value
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        };

        if let Some(uri) = trimmed(album_uri) {
            return Some(Self::Uri(uri));
        }
        match (trimmed(album_artist), trimmed(album_name)) {
            (Some(artist), Some(name)) => Some(Self::ArtistAndName { artist, name }),
            // An artist without a name (or vice versa) is not enough to
            // identify an album, so it is not a selector at all.
            _ => None,
        }
    }

    /// Appends the matching condition over the joined `tracks` table.
    pub fn push_condition(&self, sql: &mut crate::db::query::Sql) {
        match self {
            Self::Uri(uri) => {
                sql.push("t.album_uri = ").bind(uri);
            }
            Self::ArtistAndName { artist, name } => {
                sql.push("t.album_artist = ")
                    .bind(artist)
                    .push(" AND t.album = ")
                    .bind(name);
            }
        }
    }
}

/// Every upload of the caller's belonging to an album.
pub async fn find_by_album(
    db: &Backend,
    user_id: &str,
    selector: &AlbumSelector,
) -> Result<Vec<Upload>, sqlx::Error> {
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(UPLOAD_COLS, db.dialect(), Some("u")))
        .push(
            " FROM user_uploads u \
             INNER JOIN tracks t ON t.xata_id = u.track_id \
             WHERE u.user_id = ",
        )
        .bind(user_id)
        .push(" AND ");
    selector.push_condition(&mut sql);
    db.fetch_all(&sql).await
}

/// Every upload of the caller's for a track.
pub async fn find_by_track(
    db: &Backend,
    user_id: &str,
    track_id: &str,
) -> Result<Vec<Upload>, sqlx::Error> {
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(UPLOAD_COLS, db.dialect(), None))
        .push(" FROM user_uploads WHERE user_id = ")
        .bind(user_id)
        .push(" AND track_id = ")
        .bind(track_id);
    db.fetch_all(&sql).await
}

/// Every upload of the caller's on an album, by the album's row id.
///
/// Resolved through `album_tracks` rather than the track's `album_uri`, since
/// this is the id the library surface exposes.
pub async fn find_by_album_id(
    db: &Backend,
    user_id: &str,
    album_id: &str,
) -> Result<Vec<Upload>, sqlx::Error> {
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(UPLOAD_COLS, db.dialect(), Some("u")))
        .push(
            " FROM user_uploads u \
             INNER JOIN album_tracks at ON at.track_id = u.track_id \
             WHERE u.user_id = ",
        )
        .bind(user_id)
        .push(" AND at.album_id = ")
        .bind(album_id);
    db.fetch_all(&sql).await
}

/// Deletes uploads: their objects, then their rows.
///
/// Object deletion is best effort. A storage failure must not strand the row,
/// because a row pointing at an object that may or may not exist is worse than
/// an orphaned object: the user would see a track they cannot delete and
/// cannot play. The orphan costs bytes; the stuck row costs them the library.
///
/// Returns how many rows went.
pub async fn purge(
    db: &Backend,
    s3: Option<&crate::config::S3Config>,
    storage_key: &str,
    user_id: &str,
    uploads: &[Upload],
) -> Result<u64, sqlx::Error> {
    if uploads.is_empty() {
        return Ok(0);
    }

    for upload in uploads {
        if let Err(err) = delete_object(db, s3, storage_key, user_id, upload).await {
            tracing::warn!(
                key = %upload.r2_key,
                error = %err,
                "could not delete the stored object; removing the row anyway"
            );
        }
    }

    let mut sql = db.sql("DELETE FROM user_uploads WHERE user_id = ");
    sql.bind(user_id)
        .push(" AND xata_id IN ")
        .bind_list(uploads.iter().map(|upload| upload.id.as_str()));
    db.execute(&sql).await
}

async fn delete_object(
    db: &Backend,
    s3: Option<&crate::config::S3Config>,
    storage_key: &str,
    user_id: &str,
    upload: &Upload,
) -> Result<(), StorageError> {
    let target = storage::resolve(
        db,
        s3,
        storage_key,
        user_id,
        upload.storage_provider_id.as_deref(),
    )
    .await?;
    target.bucket.delete_object(&upload.r2_key).await?;
    Ok(())
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

        let statements = [
            "INSERT INTO albums (xata_id, title, artist, sha256, uri) VALUES \
             ('rec_album', 'MHTRTC', 'Boards of Canada', 'sha-al', \
              'at://did:plc:alice/app.rocksky.album/1')",
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256, album_uri) VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t1', \
              'at://did:plc:alice/app.rocksky.album/1'), \
             ('rec_t2', 'Olson', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t2', \
              'at://did:plc:alice/app.rocksky.album/1'), \
             ('rec_t3', 'Other', 'Someone', 'Someone', 'Elsewhere', 1, 'sha-t3', NULL)",
            "INSERT INTO album_tracks (xata_id, album_id, track_id) VALUES \
             ('rec_at1', 'rec_album', 'rec_t1'), ('rec_at2', 'rec_album', 'rec_t2')",
        ];
        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }

        for (id, track) in [("rec_u1", "rec_t1"), ("rec_u2", "rec_t2"), ("rec_u3", "rec_t3")] {
            let mut sql = backend.sql(
                "INSERT INTO user_uploads \
                 (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename) \
                 VALUES (",
            );
            sql.bind(id)
                .push(", ")
                .bind(&user_id)
                .push(", ")
                .bind(track)
                .push(", ")
                .bind(format!("music/{id}.flac"))
                .push(", ")
                .bind("audio/flac")
                .push(", ")
                .bind(1000i64)
                .push(", ")
                .bind(format!("{id}.flac"))
                .push(")");
            backend.execute(&sql).await.unwrap();
        }

        (backend, user_id)
    }

    #[tokio::test]
    async fn an_upload_is_found_by_its_owner_only() {
        let (db, user_id) = fixture().await;
        let upload = find(&db, &user_id, "rec_u1").await.unwrap().unwrap();
        assert_eq!(upload.r2_key, "music/rec_u1.flac");
        assert_eq!(upload.mime_type, "audio/flac");
        assert!(
            upload.storage_provider_id.is_none(),
            "the managed path stores NULL"
        );

        let bob = crate::ingest::upsert_user(&db, "did:plc:bob").await.unwrap();
        assert!(find(&db, &bob, "rec_u1").await.unwrap().is_none());
    }

    #[test]
    fn an_album_selector_needs_a_uri_or_both_name_parts() {
        assert_eq!(
            AlbumSelector::parse(Some("at://x"), None, None),
            Some(AlbumSelector::Uri("at://x".into()))
        );
        assert_eq!(
            AlbumSelector::parse(None, Some("BoC"), Some("MHTRTC")),
            Some(AlbumSelector::ArtistAndName {
                artist: "BoC".into(),
                name: "MHTRTC".into()
            })
        );

        // Half a name identifies nothing.
        assert_eq!(AlbumSelector::parse(None, Some("BoC"), None), None);
        assert_eq!(AlbumSelector::parse(None, None, Some("MHTRTC")), None);
        assert_eq!(AlbumSelector::parse(None, None, None), None);
        // Blank is absent.
        assert_eq!(AlbumSelector::parse(Some("  "), None, None), None);

        // The URI wins when both are given.
        assert_eq!(
            AlbumSelector::parse(Some("at://x"), Some("BoC"), Some("MHTRTC")),
            Some(AlbumSelector::Uri("at://x".into()))
        );
    }

    #[tokio::test]
    async fn uploads_are_found_by_either_album_form() {
        let (db, user_id) = fixture().await;

        let by_uri = find_by_album(
            &db,
            &user_id,
            &AlbumSelector::Uri("at://did:plc:alice/app.rocksky.album/1".into()),
        )
        .await
        .unwrap();
        assert_eq!(by_uri.len(), 2, "two tracks on that album");

        let by_name = find_by_album(
            &db,
            &user_id,
            &AlbumSelector::ArtistAndName {
                artist: "Boards of Canada".into(),
                name: "MHTRTC".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(by_name.len(), 2);

        // And the album row id resolves through album_tracks.
        let by_id = find_by_album_id(&db, &user_id, "rec_album").await.unwrap();
        assert_eq!(by_id.len(), 2);
    }

    #[tokio::test]
    async fn uploads_are_found_by_track() {
        let (db, user_id) = fixture().await;
        let uploads = find_by_track(&db, &user_id, "rec_t1").await.unwrap();
        assert_eq!(uploads.len(), 1);
        assert_eq!(uploads[0].id, "rec_u1");
    }

    /// The point of the whole module: deleting audio must not delete history.
    #[tokio::test]
    async fn purging_removes_the_upload_but_leaves_the_catalogue() {
        let (db, user_id) = fixture().await;
        let uploads = find_by_track(&db, &user_id, "rec_t1").await.unwrap();

        // No S3 configured, so the object delete fails and is swallowed — the
        // row must still go, or the user has a track they cannot remove.
        let deleted = purge(&db, None, "key", &user_id, &uploads).await.unwrap();
        assert_eq!(deleted, 1);

        assert!(find(&db, &user_id, "rec_u1").await.unwrap().is_none());
        // The shared rows are untouched.
        for table in ["tracks", "albums", "album_tracks"] {
            let count = db
                .count(&db.sql(format!("SELECT count(*) FROM {table}")))
                .await
                .unwrap();
            assert!(count > 0, "{table} must not be cascaded away");
        }
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM tracks WHERE xata_id = 'rec_t1'"))
                .await
                .unwrap(),
            1,
            "the track row is shared and referenced by scrobbles"
        );
    }

    #[tokio::test]
    async fn purging_is_scoped_to_the_owner() {
        let (db, user_id) = fixture().await;
        let bob = crate::ingest::upsert_user(&db, "did:plc:bob").await.unwrap();

        let uploads = find_by_track(&db, &user_id, "rec_t1").await.unwrap();
        // Bob naming Alice's upload must delete nothing.
        let deleted = purge(&db, None, "key", &bob, &uploads).await.unwrap();
        assert_eq!(deleted, 0);
        assert!(find(&db, &user_id, "rec_u1").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn purging_nothing_is_a_no_op() {
        let (db, user_id) = fixture().await;
        assert_eq!(purge(&db, None, "key", &user_id, &[]).await.unwrap(), 0);
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM user_uploads")).await.unwrap(),
            3
        );
    }
}
